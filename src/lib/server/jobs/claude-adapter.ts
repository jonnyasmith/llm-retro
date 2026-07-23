import type { TokenBuckets } from './ingest-pipeline';
import { canonicaliseModel } from '../model';

interface ClaudeRecord {
  type?: unknown;
  uuid?: unknown;
  id?: unknown;
  cwd?: unknown;
  timestamp?: unknown;
  agentId?: unknown;
  isMeta?: unknown;
  isSidechain?: unknown;
  content?: unknown;
  toolUseResult?: unknown;
  message?: {
    content?: unknown;
    model?: unknown;
    usage?: Record<string, unknown>;
  };
}

interface PendingInteraction {
  interactionKey: string;
  cwd: string;
  timestamp: number;
  assistants: ClaudeRecord[];
  records: ClaudeRecord[];
}

export interface NormalisedClaudeInteraction {
  interactionKey: string;
  cwd: string;
  model: string;
  modelRaw: string;
  mainTokens: TokenBuckets;
  subTokens: TokenBuckets;
  timestamp: number;
}

export interface NormalisedClaudeSession {
  cwd: string | null;
  startedAt: number | null;
  endedAt: number | null;
  interactions: NormalisedClaudeInteraction[];
  requiresInteractionContext: boolean;
}

export interface ClaudeSubTokenUpdate {
  interactionKey: string;
  subTokens: TokenBuckets;
}

export interface ClaudeSourceContents {
  filePath: string;
  contents: string;
}

const tokenSources = [
  ['input', 'input_tokens'],
  ['output', 'output_tokens'],
  ['cacheRead', 'cache_read_input_tokens'],
  ['cacheWrite', 'cache_creation_input_tokens'],
] as const satisfies ReadonlyArray<readonly [keyof TokenBuckets, string]>;

export function readClaudeSession(
  filePath: string,
  primaryContents: string,
  subagentFiles: ClaudeSourceContents[] = [],
): NormalisedClaudeSession {
  const records = parseRecords(primaryContents, filePath);
  const agentRecords = groupAgentRecords(records);
  mergeAgentRecords(agentRecords, parseSubagentFiles(subagentFiles));
  return normaliseSession(records, agentRecords, filePath);
}

export function readClaudeSubTokenUpdates(
  filePath: string,
  primaryContents: string,
  subagentFiles: ClaudeSourceContents[] = [],
): ClaudeSubTokenUpdate[] {
  const records = parseRecords(primaryContents, filePath);
  const agentRecords = groupAgentRecords(records);
  mergeAgentRecords(agentRecords, parseSubagentFiles(subagentFiles));
  const pendingInteractions = collectPendingInteractions(records, filePath);
  const agentsByInteraction = attributeCompletedAgents(
    pendingInteractions,
    records,
  );
  return pendingInteractions.map((interaction) => ({
    interactionKey: interaction.interactionKey,
    subTokens: sumTokens(
      collectSubagentAssistants(
        agentsByInteraction.get(interaction) ?? [],
        agentRecords,
      ),
    ),
  }));
}

export function findClaudeInteractionContextByteOffset(
  contents: Buffer,
  beforeByteOffset: number,
): number {
  let lineStart = 0;
  let lastGenuinePromptStart = 0;
  let lineNumber = 1;
  while (lineStart < beforeByteOffset) {
    const newline = contents.indexOf(10, lineStart);
    if (newline === -1 || newline >= beforeByteOffset) break;
    const line = contents.subarray(lineStart, newline).toString('utf8');
    if (line.length > 0) {
      const [record] = parseRecords(
        line,
        '<Claude primary context>',
        lineNumber,
      );
      if (isGenuineUserPrompt(record)) lastGenuinePromptStart = lineStart;
    }
    lineStart = newline + 1;
    lineNumber += 1;
  }
  return lastGenuinePromptStart;
}

function parseSubagentFiles(
  files: ClaudeSourceContents[],
): Map<string, ClaudeRecord[]> {
  const grouped = new Map<string, ClaudeRecord[]>();
  for (const { filePath, contents } of files) {
    const records = parseRecords(contents, filePath);
    mergeAgentRecords(grouped, groupAgentRecords(records));
  }
  return grouped;
}

function mergeAgentRecords(
  target: Map<string, ClaudeRecord[]>,
  source: Map<string, ClaudeRecord[]>,
): void {
  for (const [agentId, records] of source) {
    const existing = target.get(agentId) ?? [];
    for (const record of records) existing.push(record);
    target.set(agentId, existing);
  }
}

function groupAgentRecords(
  records: ClaudeRecord[],
): Map<string, ClaudeRecord[]> {
  const grouped = new Map<string, ClaudeRecord[]>();
  for (const record of records) {
    if (record.isSidechain !== true || typeof record.agentId !== 'string') {
      continue;
    }
    const existing = grouped.get(record.agentId) ?? [];
    existing.push(record);
    grouped.set(record.agentId, existing);
  }
  return grouped;
}

function parseRecords(
  contents: string,
  filePath: string,
  firstLineNumber = 1,
): ClaudeRecord[] {
  return contents
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as ClaudeRecord;
      } catch (cause) {
        throw new SyntaxError(
          `Invalid Claude JSONL at ${filePath}:${firstLineNumber + index}`,
          { cause },
        );
      }
    });
}

function normaliseSession(
  records: ClaudeRecord[],
  agentRecords: Map<string, ClaudeRecord[]>,
  filePath: string,
): NormalisedClaudeSession {
  let startedAt: number | null = null;
  let endedAt: number | null = null;
  for (const record of records) {
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp === null) continue;
    startedAt = startedAt === null ? timestamp : Math.min(startedAt, timestamp);
    endedAt = endedAt === null ? timestamp : Math.max(endedAt, timestamp);
  }
  const cwd = records.find(
    (record): record is ClaudeRecord & { cwd: string } =>
      typeof record.cwd === 'string' && record.cwd.length > 0,
  )?.cwd;
  const pendingInteractions = collectPendingInteractions(records, filePath);
  const agentsByInteraction = attributeCompletedAgents(
    pendingInteractions,
    records,
  );
  const interactions = pendingInteractions.map((interaction) =>
    normaliseInteraction(
      interaction,
      agentsByInteraction.get(interaction) ?? [],
      agentRecords,
      filePath,
    ),
  );

  return {
    cwd: cwd ?? null,
    startedAt,
    endedAt,
    interactions,
    requiresInteractionContext:
      recordsBeforeFirstPromptAffectInteraction(records),
  };
}

function recordsBeforeFirstPromptAffectInteraction(
  records: ClaudeRecord[],
): boolean {
  for (const record of records) {
    if (isGenuineUserPrompt(record)) return false;
    if (record.type === 'assistant' || record.type === 'user') return true;
  }
  return false;
}

function collectPendingInteractions(
  records: ClaudeRecord[],
  filePath: string,
): PendingInteraction[] {
  const pendingInteractions: PendingInteraction[] = [];
  let pending: PendingInteraction | null = null;
  for (const record of records) {
    if (isGenuineUserPrompt(record)) {
      if (pending && pending.assistants.length > 0) {
        pendingInteractions.push(pending);
      }
      pending = openInteraction(record, filePath);
      continue;
    }
    if (!pending) continue;
    pending.records.push(record);
    if (record.type === 'assistant' && record.isSidechain !== true) {
      pending.assistants.push(record);
    }
  }
  if (pending && pending.assistants.length > 0) {
    pendingInteractions.push(pending);
  }

  return pendingInteractions;
}

function isGenuineUserPrompt(record: ClaudeRecord): boolean {
  if (
    record.type !== 'user' ||
    record.isSidechain === true ||
    record.isMeta === true
  ) {
    return false;
  }
  const content = record.message?.content ?? record.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content)) return false;
  if (content.some(isToolResultBlock)) return false;
  return content.some(isTextBlock);
}

function isToolResultBlock(value: unknown): boolean {
  return isRecord(value) && value.type === 'tool_result';
}

function isTextBlock(value: unknown): boolean {
  return (
    isRecord(value) && value.type === 'text' && typeof value.text === 'string'
  );
}

function openInteraction(
  record: ClaudeRecord,
  filePath: string,
): PendingInteraction {
  const interactionKey =
    typeof record.uuid === 'string'
      ? record.uuid
      : typeof record.id === 'string'
        ? record.id
        : null;
  if (!interactionKey) {
    throw new Error(`Genuine Claude user record has no id: ${filePath}`);
  }
  if (typeof record.cwd !== 'string' || record.cwd.length === 0) {
    throw new Error(`Genuine Claude user record has no cwd: ${filePath}`);
  }
  const timestamp = parseTimestamp(record.timestamp);
  if (timestamp === null) {
    throw new Error(
      `Genuine Claude user record has an invalid timestamp: ${filePath}`,
    );
  }
  return {
    interactionKey,
    cwd: record.cwd,
    timestamp,
    assistants: [],
    records: [],
  };
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normaliseInteraction(
  pending: PendingInteraction,
  rootAgentIds: string[],
  agentRecords: Map<string, ClaudeRecord[]>,
  filePath: string,
): NormalisedClaudeInteraction {
  const modelRaw = selectModel(pending.assistants, filePath);
  const subagentAssistants = collectSubagentAssistants(
    rootAgentIds,
    agentRecords,
  );
  return {
    interactionKey: pending.interactionKey,
    cwd: pending.cwd,
    model: canonicaliseModel(modelRaw),
    modelRaw,
    mainTokens: sumTokens(pending.assistants),
    subTokens: sumTokens(subagentAssistants),
    timestamp: pending.timestamp,
  };
}

function attributeCompletedAgents(
  interactions: PendingInteraction[],
  sessionRecords: ClaudeRecord[],
): Map<PendingInteraction, string[]> {
  const spawningInteractionByToolUseId = new Map<string, PendingInteraction>();
  for (const interaction of interactions) {
    for (const toolUseId of agentToolUseIds(interaction.records, false)) {
      spawningInteractionByToolUseId.set(toolUseId, interaction);
    }
  }

  const agentsByInteraction = new Map<PendingInteraction, string[]>();
  for (const completion of completedAgentResults(sessionRecords, false)) {
    const interaction = spawningInteractionByToolUseId.get(
      completion.toolUseId,
    );
    if (!interaction) continue;
    const agentIds = agentsByInteraction.get(interaction) ?? [];
    agentIds.push(completion.agentId);
    agentsByInteraction.set(interaction, agentIds);
  }
  return agentsByInteraction;
}

function completedSpawnedAgentIds(records: ClaudeRecord[]): string[] {
  const toolUseIds = agentToolUseIds(records, true);
  return completedAgentResults(records, true)
    .filter((completion) => toolUseIds.has(completion.toolUseId))
    .map((completion) => completion.agentId);
}

function agentToolUseIds(
  records: ClaudeRecord[],
  sidechain: boolean,
): Set<string> {
  const toolUseIds = new Set<string>();
  for (const record of records) {
    if ((record.isSidechain === true) !== sidechain) continue;
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        isRecord(block) &&
        block.type === 'tool_use' &&
        block.name === 'Agent' &&
        typeof block.id === 'string'
      ) {
        toolUseIds.add(block.id);
      }
    }
  }
  return toolUseIds;
}

function completedAgentResults(
  records: ClaudeRecord[],
  sidechain: boolean,
): Array<{ toolUseId: string; agentId: string }> {
  const completions: Array<{ toolUseId: string; agentId: string }> = [];
  for (const record of records) {
    if ((record.isSidechain === true) !== sidechain) continue;
    if (!isRecord(record.toolUseResult)) continue;
    const result = record.toolUseResult;
    if (result.status !== 'completed' || typeof result.agentId !== 'string') {
      continue;
    }
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        isRecord(block) &&
        block.type === 'tool_result' &&
        typeof block.tool_use_id === 'string'
      ) {
        completions.push({
          toolUseId: block.tool_use_id,
          agentId: result.agentId,
        });
      }
    }
  }
  return completions;
}

function collectSubagentAssistants(
  rootAgentIds: string[],
  agentRecords: Map<string, ClaudeRecord[]>,
): ClaudeRecord[] {
  const assistants: ClaudeRecord[] = [];
  const visited = new Set<string>();

  const visit = (agentId: string) => {
    if (visited.has(agentId)) return;
    visited.add(agentId);
    const records = agentRecords.get(agentId);
    if (!records) return;
    for (const record of records) {
      if (record.type === 'assistant' && record.isSidechain === true) {
        assistants.push(record);
      }
    }
    for (const childAgentId of completedSpawnedAgentIds(records)) {
      visit(childAgentId);
    }
  };

  for (const agentId of rootAgentIds) visit(agentId);
  return assistants;
}

function sumTokens(records: ClaudeRecord[]): TokenBuckets {
  const buckets: TokenBuckets = {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
  };
  for (const [bucket, sourceKey] of tokenSources) {
    const values = records
      .map((record) => record.message?.usage?.[sourceKey])
      .filter((value): value is number => typeof value === 'number');
    buckets[bucket] =
      values.length === 0
        ? null
        : values.reduce((total, value) => total + value, 0);
  }
  return buckets;
}

function selectModel(assistants: ClaudeRecord[], filePath: string): string {
  const outputByModel = new Map<string, number>();
  for (const assistant of assistants) {
    const model = assistant.message?.model;
    if (typeof model !== 'string' || model.length === 0) continue;
    const outputTokens = assistant.message?.usage?.output_tokens;
    outputByModel.set(
      model,
      (outputByModel.get(model) ?? 0) +
        (typeof outputTokens === 'number' ? outputTokens : 0),
    );
  }
  const firstModel = outputByModel.keys().next().value;
  if (!firstModel) {
    throw new Error(`Responded Claude Interaction has no model: ${filePath}`);
  }
  if (outputByModel.size === 1) return firstModel;

  let selected = firstModel;
  for (const [model, outputTokens] of outputByModel) {
    if (outputTokens > (outputByModel.get(selected) ?? 0)) selected = model;
  }
  return selected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
