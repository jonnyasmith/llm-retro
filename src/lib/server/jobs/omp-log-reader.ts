import { basename, dirname, relative } from 'node:path';
import { harnessLabels } from '../../jobs/contracts';
import type {
  IngestSourceContents,
  NormalisedInteraction,
} from './ingest-pipeline';
import { findLastPromptBoundary } from './jsonl-scan';
import {
  accumulateTokens,
  nullTokenBuckets,
  type TokenBuckets,
} from './token-buckets';
import { resolveServingModel, type ModelCandidate } from '../model';

interface OmpRecord {
  type?: unknown;
  id?: unknown;
  timestamp?: unknown;
  cwd?: unknown;
  message?: {
    role?: unknown;
    model?: unknown;
    usage?: Record<string, unknown>;
    content?: unknown;
    toolName?: unknown;
  };
}

interface PendingInteraction {
  interactionKey: string;
  cwd: string;
  timestamp: number;
  assistants: OmpRecord[];
  records: OmpRecord[];
}

interface AgentLog {
  key: string;
  parentKey: string | null;
  name: string;
  records: OmpRecord[];
}

export interface OmpSessionMetadata {
  stableSessionId: string;
  cwd: string;
  timestamp: number | null;
}

export interface NormalisedOmpSession {
  startedAt: number | null;
  endedAt: number | null;
  interactions: NormalisedInteraction[];
}

export interface OmpSubTokenUpdate {
  interactionKey: string;
  subTokens: TokenBuckets;
}

// The only Harness-shaped part of token extraction: which wire field is which
// bucket. The output key is named because the serving-Model rule needs it too.
const outputWireKey = 'output';

const tokenSources = [
  ['input', 'input'],
  ['output', outputWireKey],
  ['cacheRead', 'cacheRead'],
  ['cacheWrite', 'cacheWrite'],
] as const satisfies ReadonlyArray<readonly [keyof TokenBuckets, string]>;

export function readOmpSessionMetadata(
  filePath: string,
  contents: Buffer,
): OmpSessionMetadata {
  const completeByteOffset = contents.lastIndexOf(10) + 1;
  const records = parseRecords(
    contents.subarray(0, completeByteOffset).toString('utf8'),
    filePath,
  );
  const session = records.find((record) => record.type === 'session');
  if (!session) {
    throw new Error(`omp session has no complete session record: ${filePath}`);
  }
  if (typeof session.id !== 'string' || session.id.length === 0) {
    throw new Error(`omp session record has no id: ${filePath}`);
  }
  if (typeof session.cwd !== 'string' || session.cwd.length === 0) {
    throw new Error(`omp session record has no cwd: ${filePath}`);
  }
  return {
    stableSessionId: session.id,
    cwd: session.cwd,
    timestamp: parseTimestamp(session.timestamp),
  };
}

export function readOmpSession(
  filePath: string,
  contents: string,
  auxiliaryFiles: IngestSourceContents[],
  metadata: OmpSessionMetadata,
): NormalisedOmpSession {
  const records = parseRecords(contents, filePath);
  const agentLogs = parseAgentLogs(filePath, auxiliaryFiles);
  let startedAt = metadata.timestamp;
  let endedAt = metadata.timestamp;
  for (const record of records) {
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp === null) continue;
    startedAt = startedAt === null ? timestamp : Math.min(startedAt, timestamp);
    endedAt = endedAt === null ? timestamp : Math.max(endedAt, timestamp);
  }

  return {
    startedAt,
    endedAt,
    interactions: collectPendingInteractions(
      records,
      filePath,
      metadata.cwd,
    ).map((pending) =>
      normaliseInteraction(pending, records, agentLogs, filePath),
    ),
  };
}

export function readOmpSubTokenUpdates(
  filePath: string,
  primaryContents: string,
  auxiliaryFiles: IngestSourceContents[],
  metadata: OmpSessionMetadata,
): OmpSubTokenUpdate[] {
  const records = parseRecords(primaryContents, filePath);
  const agentLogs = parseAgentLogs(filePath, auxiliaryFiles);
  return collectPendingInteractions(records, filePath, metadata.cwd).map(
    (pending) => ({
      interactionKey: pending.interactionKey,
      subTokens: sumTokens(
        collectSubagentAssistants(
          completedSpawnedAgentNames(pending.records, records),
          agentLogs,
        ),
      ),
    }),
  );
}

export function findOmpPromptBoundary(
  contents: Buffer,
  beforeByteOffset: number,
): number {
  return findLastPromptBoundary(
    contents,
    beforeByteOffset,
    (line, lineNumber) =>
      isGenuineUserPrompt(
        parseRecords(line, '<omp primary context>', lineNumber)[0],
      ),
  );
}

function parseRecords(
  contents: string,
  filePath: string,
  firstLineNumber = 1,
): OmpRecord[] {
  const records: OmpRecord[] = [];
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error('record is not an object');
      records.push(parsed);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Invalid omp JSONL at ${filePath}:${firstLineNumber + index}: ${message}`,
        { cause },
      );
    }
  }
  return records;
}

function parseAgentLogs(
  primaryFilePath: string,
  files: IngestSourceContents[],
): AgentLog[] {
  const sessionDirectory = primaryFilePath.slice(0, -'.jsonl'.length);
  return files.map(({ filePath, contents }) => {
    const relativePath = relative(sessionDirectory, filePath);
    const key = relativePath.slice(0, -'.jsonl'.length);
    const parentDirectory = dirname(key);
    const parentKey = parentDirectory === '.' ? null : parentDirectory;
    const stem = basename(key);
    const parentName = parentKey === null ? null : basename(parentKey);
    const name =
      parentName !== null && stem.startsWith(`${parentName}.`)
        ? stem.slice(parentName.length + 1)
        : stem;
    return {
      key,
      parentKey,
      name,
      records: parseRecords(contents, filePath),
    };
  });
}

function collectPendingInteractions(
  records: OmpRecord[],
  filePath: string,
  defaultCwd: string,
): PendingInteraction[] {
  const complete: PendingInteraction[] = [];
  let pending: PendingInteraction | null = null;
  for (const record of records) {
    if (isGenuineUserPrompt(record)) {
      if (pending && pending.assistants.length > 0) complete.push(pending);
      pending = openInteraction(record, filePath, defaultCwd);
      continue;
    }
    if (!pending) continue;
    pending.records.push(record);
    if (isAssistant(record)) pending.assistants.push(record);
  }
  if (pending && pending.assistants.length > 0) complete.push(pending);
  return complete;
}

function isGenuineUserPrompt(record: OmpRecord): boolean {
  return record.type === 'message' && record.message?.role === 'user';
}

function isAssistant(record: OmpRecord): boolean {
  return record.type === 'message' && record.message?.role === 'assistant';
}

function openInteraction(
  record: OmpRecord,
  filePath: string,
  defaultCwd: string,
): PendingInteraction {
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new Error(`Genuine omp user message has no id: ${filePath}`);
  }
  const timestamp = parseTimestamp(record.timestamp);
  if (timestamp === null) {
    throw new Error(
      `Genuine omp user message has an invalid timestamp: ${filePath}`,
    );
  }
  return {
    interactionKey: record.id,
    cwd:
      typeof record.cwd === 'string' && record.cwd.length > 0
        ? record.cwd
        : defaultCwd,
    timestamp,
    assistants: [],
    records: [],
  };
}

function normaliseInteraction(
  pending: PendingInteraction,
  sessionRecords: OmpRecord[],
  agentLogs: AgentLog[],
  filePath: string,
): NormalisedInteraction {
  const serving = resolveServingModel(modelCandidates(pending.assistants));
  if (serving === null) {
    throw new Error(
      `Responded ${harnessLabels.omp} Interaction has no model: ${filePath}`,
    );
  }
  return {
    interactionKey: pending.interactionKey,
    cwd: pending.cwd,
    model: serving.model,
    modelRaw: serving.modelRaw,
    mainTokens: sumTokens(pending.assistants),
    subTokens: sumTokens(
      collectSubagentAssistants(
        completedSpawnedAgentNames(pending.records, sessionRecords),
        agentLogs,
      ),
    ),
    spawnedSubagents: false,
    timestamp: pending.timestamp,
  };
}

function spawnedAgentNames(records: OmpRecord[]): string[] {
  const names: string[] = [];
  for (const record of records) {
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        !isRecord(block) ||
        block.type !== 'toolCall' ||
        block.name !== 'task'
      ) {
        continue;
      }
      if (!isRecord(block.arguments) || !Array.isArray(block.arguments.tasks)) {
        continue;
      }
      for (const task of block.arguments.tasks) {
        if (isRecord(task) && typeof task.name === 'string') {
          names.push(task.name);
        }
      }
    }
  }
  return names;
}

function completedSpawnedAgentNames(
  spawningRecords: OmpRecord[],
  completionRecords: OmpRecord[],
): string[] {
  const completedIds = completedAgentIds(completionRecords);
  return spawnedAgentNames(spawningRecords).filter((name) =>
    completedIds.some((id) => id === name || id.endsWith(`.${name}`)),
  );
}

function completedAgentIds(records: OmpRecord[]): string[] {
  const ids: string[] = [];
  for (const record of records) {
    if (record.message?.role !== 'toolResult') continue;
    const content = record.message.content;
    const texts =
      typeof content === 'string'
        ? [content]
        : Array.isArray(content)
          ? content.flatMap((block) =>
              isRecord(block) && typeof block.text === 'string'
                ? [block.text]
                : [],
            )
          : [];
    for (const text of texts) {
      for (const match of text.matchAll(/<task-result\b([^>]*)>/g)) {
        const attributes = match[1];
        const id = /\bid="([^"]+)"/.exec(attributes)?.[1];
        const status = /\bstatus="([^"]+)"/.exec(attributes)?.[1];
        if (id && status === 'completed') ids.push(id);
      }
    }
  }
  return ids;
}

function collectSubagentAssistants(
  rootNames: string[],
  agentLogs: AgentLog[],
): OmpRecord[] {
  const assistants: OmpRecord[] = [];
  const visited = new Set<string>();

  const visit = (parentKey: string | null, name: string) => {
    const log = agentLogs.find(
      (candidate) =>
        candidate.parentKey === parentKey &&
        (candidate.name === name || candidate.name.endsWith(`.${name}`)),
    );
    if (!log || visited.has(log.key)) return;
    visited.add(log.key);
    for (const record of log.records) {
      if (isAssistant(record)) assistants.push(record);
    }
    for (const childName of completedSpawnedAgentNames(
      log.records,
      log.records,
    )) {
      visit(log.key, childName);
    }
  };

  for (const rootName of rootNames) visit(null, rootName);
  return assistants;
}

function sumTokens(records: OmpRecord[]): TokenBuckets {
  const buckets = nullTokenBuckets();
  for (const record of records) {
    for (const [bucket, wireKey] of tokenSources) {
      accumulateTokens(buckets, bucket, record.message?.usage?.[wireKey]);
    }
  }
  return buckets;
}

function modelCandidates(assistants: OmpRecord[]): ModelCandidate[] {
  const candidates: ModelCandidate[] = [];
  for (const assistant of assistants) {
    const modelRaw = assistant.message?.model;
    if (typeof modelRaw !== 'string' || modelRaw.length === 0) continue;
    const outputTokens = assistant.message?.usage?.[outputWireKey];
    candidates.push({
      modelRaw,
      outputTokens: typeof outputTokens === 'number' ? outputTokens : 0,
    });
  }
  return candidates;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
