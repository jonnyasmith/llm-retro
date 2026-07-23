import type { TokenBuckets } from './claude-adapter';

interface PiRecord {
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
  assistants: PiRecord[];
  records: PiRecord[];
}

export interface PiSessionMetadata {
  stableSessionId: string;
  cwd: string;
  timestamp: number | null;
}

export interface NormalisedPiInteraction {
  interactionKey: string;
  cwd: string;
  model: string;
  modelRaw: string;
  mainTokens: TokenBuckets;
  subTokens: TokenBuckets;
  spawnedSubagents: boolean;
  timestamp: number;
}

export interface NormalisedPiSession {
  cwd: string;
  startedAt: number | null;
  endedAt: number | null;
  interactions: NormalisedPiInteraction[];
  requiresInteractionContext: boolean;
}

const tokenSources = [
  ['input', 'input'],
  ['output', 'output'],
  ['cacheRead', 'cacheRead'],
  ['cacheWrite', 'cacheWrite'],
] as const satisfies ReadonlyArray<readonly [keyof TokenBuckets, string]>;

const nullTokens: TokenBuckets = {
  input: null,
  output: null,
  cacheRead: null,
  cacheWrite: null,
};

export function readPiSessionMetadata(
  filePath: string,
  contents: Buffer,
): PiSessionMetadata {
  const newline = contents.indexOf(10);
  if (newline === -1) {
    throw new Error(`pi session has no complete metadata record: ${filePath}`);
  }
  const [record] = parseRecords(
    contents.subarray(0, newline).toString('utf8'),
    filePath,
  );
  if (record.type !== 'session') {
    throw new Error(
      `pi session does not start with a session record: ${filePath}`,
    );
  }
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new Error(`pi session record has no id: ${filePath}`);
  }
  if (typeof record.cwd !== 'string' || record.cwd.length === 0) {
    throw new Error(`pi session record has no cwd: ${filePath}`);
  }
  return {
    stableSessionId: record.id,
    cwd: record.cwd,
    timestamp: parseTimestamp(record.timestamp),
  };
}

export function readPiSession(
  filePath: string,
  contents: string,
  metadata: PiSessionMetadata,
): NormalisedPiSession {
  const records = parseRecords(contents, filePath);
  let startedAt = metadata.timestamp;
  let endedAt = metadata.timestamp;
  for (const record of records) {
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp === null) continue;
    startedAt = startedAt === null ? timestamp : Math.min(startedAt, timestamp);
    endedAt = endedAt === null ? timestamp : Math.max(endedAt, timestamp);
  }

  return {
    cwd: metadata.cwd,
    startedAt,
    endedAt,
    interactions: collectPendingInteractions(
      records,
      filePath,
      metadata.cwd,
    ).map((pending) => normaliseInteraction(pending, filePath)),
    requiresInteractionContext:
      recordsBeforeFirstPromptAffectInteraction(records),
  };
}

export function findPiInteractionContextByteOffset(
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
      const [record] = parseRecords(line, '<pi primary context>', lineNumber);
      if (isGenuineUserPrompt(record)) lastGenuinePromptStart = lineStart;
    }
    lineStart = newline + 1;
    lineNumber += 1;
  }
  return lastGenuinePromptStart;
}

function parseRecords(
  contents: string,
  filePath: string,
  firstLineNumber = 1,
): PiRecord[] {
  const records: PiRecord[] = [];
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error('record is not an object');
      records.push(parsed);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Invalid pi JSONL at ${filePath}:${firstLineNumber + index}: ${message}`,
        { cause },
      );
    }
  }
  return records;
}

function recordsBeforeFirstPromptAffectInteraction(
  records: PiRecord[],
): boolean {
  for (const record of records) {
    if (isGenuineUserPrompt(record)) return false;
    if (
      record.type === 'message' &&
      (record.message?.role === 'assistant' ||
        record.message?.role === 'toolResult')
    ) {
      return true;
    }
  }
  return false;
}

function collectPendingInteractions(
  records: PiRecord[],
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

function isGenuineUserPrompt(record: PiRecord): boolean {
  return record.type === 'message' && record.message?.role === 'user';
}

function isAssistant(record: PiRecord): boolean {
  return record.type === 'message' && record.message?.role === 'assistant';
}

function openInteraction(
  record: PiRecord,
  filePath: string,
  defaultCwd: string,
): PendingInteraction {
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new Error(`Genuine pi user message has no id: ${filePath}`);
  }
  const timestamp = parseTimestamp(record.timestamp);
  if (timestamp === null) {
    throw new Error(
      `Genuine pi user message has an invalid timestamp: ${filePath}`,
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
  filePath: string,
): NormalisedPiInteraction {
  const modelRaw = selectModel(pending.assistants, filePath);
  return {
    interactionKey: pending.interactionKey,
    cwd: pending.cwd,
    model: canonicaliseModel(modelRaw),
    modelRaw,
    mainTokens: sumTokens(pending.assistants),
    subTokens: { ...nullTokens },
    spawnedSubagents: pending.records.some(spawnedSubagent),
    timestamp: pending.timestamp,
  };
}

function sumTokens(records: PiRecord[]): TokenBuckets {
  const buckets: TokenBuckets = { ...nullTokens };
  for (const record of records) {
    for (const [bucket, sourceKey] of tokenSources) {
      const value = record.message?.usage?.[sourceKey];
      if (typeof value === 'number') {
        buckets[bucket] = (buckets[bucket] ?? 0) + value;
      }
    }
  }
  return buckets;
}

function selectModel(assistants: PiRecord[], filePath: string): string {
  const outputByModel = new Map<string, number>();
  for (const assistant of assistants) {
    const model = assistant.message?.model;
    if (typeof model !== 'string' || model.length === 0) continue;
    const outputTokens = assistant.message?.usage?.output;
    outputByModel.set(
      model,
      (outputByModel.get(model) ?? 0) +
        (typeof outputTokens === 'number' ? outputTokens : 0),
    );
  }
  const firstModel = outputByModel.keys().next().value;
  if (!firstModel) {
    throw new Error(`Responded pi Interaction has no model: ${filePath}`);
  }
  let selected = firstModel;
  for (const [model, outputTokens] of outputByModel) {
    if (outputTokens > (outputByModel.get(selected) ?? 0)) selected = model;
  }
  return selected;
}

function spawnedSubagent(record: PiRecord): boolean {
  if (
    record.type === 'message' &&
    record.message?.role === 'toolResult' &&
    record.message.toolName === 'subagent'
  ) {
    return true;
  }
  const content = record.message?.content;
  return (
    Array.isArray(content) &&
    content.some(
      (block) =>
        isRecord(block) &&
        block.type === 'toolCall' &&
        block.name === 'subagent',
    )
  );
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function canonicaliseModel(model: string): string {
  return model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
