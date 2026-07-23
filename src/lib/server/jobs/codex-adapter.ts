import type { NormalisedInteraction, TokenBuckets } from './ingest-pipeline';
import { canonicaliseModel } from '../model';

interface CodexRecord {
  timestamp?: unknown;
  type?: unknown;
  payload?: Record<string, unknown>;
}

interface PendingInteraction {
  interactionKey: string;
  cwd: string | null;
  modelRaw: string | null;
  timestamp: number;
  hasAssistantResponse: boolean;
  hasTokenUsage: boolean;
  tokens: TokenBuckets;
}

export interface CodexSessionMetadata {
  stableSessionId: string;
  timestamp: number | null;
}

export interface NormalisedCodexSession {
  startedAt: number | null;
  endedAt: number | null;
  interactions: NormalisedInteraction[];
}

const nullTokens: TokenBuckets = {
  input: null,
  output: null,
  cacheRead: null,
  cacheWrite: null,
};

export function readCodexSessionMetadata(
  filePath: string,
  contents: Buffer,
): CodexSessionMetadata {
  const newline = contents.indexOf(10);
  if (newline === -1) {
    throw new Error(
      `Codex session has no complete metadata record: ${filePath}`,
    );
  }
  const [record] = parseRecords(
    contents.subarray(0, newline).toString('utf8'),
    filePath,
  );
  if (record.type !== 'session_meta') {
    throw new Error(
      `Codex session does not start with a session_meta record: ${filePath}`,
    );
  }
  const stableSessionId = record.payload?.id;
  if (typeof stableSessionId !== 'string' || stableSessionId.length === 0) {
    throw new Error(`Codex session metadata has no id: ${filePath}`);
  }
  return {
    stableSessionId,
    timestamp:
      parseTimestamp(record.timestamp) ??
      parseTimestamp(record.payload?.timestamp),
  };
}

export function readCodexSession(
  filePath: string,
  contents: string,
  metadata: CodexSessionMetadata,
  initialTotalTokenUsage: number | null = null,
): NormalisedCodexSession | null {
  const records = parseRecords(contents, filePath);
  let startedAt = metadata.timestamp;
  let endedAt = metadata.timestamp;
  for (const record of records) {
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp === null) continue;
    startedAt = startedAt === null ? timestamp : Math.min(startedAt, timestamp);
    endedAt = endedAt === null ? timestamp : Math.max(endedAt, timestamp);
  }

  const interactions: NormalisedInteraction[] = [];
  let firstTurnCwd: string | null = null;
  let pending: PendingInteraction | null = null;
  let maximumTotalTokenUsage = initialTotalTokenUsage;
  const finishPending = () => {
    if (
      pending !== null &&
      pending.cwd !== null &&
      pending.modelRaw !== null &&
      pending.hasAssistantResponse &&
      pending.hasTokenUsage
    ) {
      interactions.push({
        interactionKey: pending.interactionKey,
        cwd: pending.cwd,
        model: canonicaliseModel(pending.modelRaw),
        modelRaw: pending.modelRaw,
        mainTokens: pending.tokens,
        subTokens: { ...nullTokens },
        spawnedSubagents: false,
        timestamp: pending.timestamp,
      });
    }
    pending = null;
  };

  for (const record of records) {
    if (record.type === 'turn_context') {
      const attribution = readTurnAttribution(record, filePath);
      firstTurnCwd ??= attribution.cwd;
      if (pending && pending.cwd === null) {
        pending.cwd = attribution.cwd;
        pending.modelRaw = attribution.modelRaw;
      }
      if (pending && attribution.turnId !== null) {
        pending.interactionKey = attribution.turnId;
      }
      continue;
    }
    if (record.type !== 'event_msg') continue;
    const eventType = record.payload?.type;
    if (eventType === 'user_message') {
      finishPending();
      pending = openInteraction(record, filePath);
    } else if (eventType === 'agent_message') {
      if (pending) pending.hasAssistantResponse = true;
    } else if (eventType === 'token_count') {
      const totalTokenUsage = readTotalTokenUsage(record, filePath);
      if (
        totalTokenUsage !== null &&
        (maximumTotalTokenUsage === null ||
          totalTokenUsage > maximumTotalTokenUsage)
      ) {
        maximumTotalTokenUsage = totalTokenUsage;
        if (pending) addLastTokenUsage(pending, record, filePath);
      }
    }
  }
  finishPending();

  const cwd = interactions[0]?.cwd ?? firstTurnCwd;
  if (cwd === null) return null;
  return { startedAt, endedAt, interactions };
}

export function findCodexPromptResumeContext(
  contents: Buffer,
  beforeByteOffset: number,
): { byteOffset: number; previousTotalTokenUsage: number | null } {
  let lineStart = 0;
  let lineNumber = 1;
  let maximumTotalTokenUsage: number | null = null;
  let previousPrompt:
    { byteOffset: number; previousTotalTokenUsage: number | null } | undefined;
  let latestPrompt:
    { byteOffset: number; previousTotalTokenUsage: number | null } | undefined;
  while (lineStart < beforeByteOffset) {
    const newline = contents.indexOf(10, lineStart);
    if (newline === -1 || newline >= beforeByteOffset) break;
    const line = contents.subarray(lineStart, newline).toString('utf8');
    if (line.length > 0) {
      const [record] = parseRecords(
        line,
        '<Codex primary context>',
        lineNumber,
      );
      if (isGenuinePrompt(record)) {
        previousPrompt = latestPrompt;
        latestPrompt = {
          byteOffset: lineStart,
          previousTotalTokenUsage: maximumTotalTokenUsage,
        };
      } else if (
        record.type === 'event_msg' &&
        record.payload?.type === 'token_count'
      ) {
        const total = readTotalTokenUsage(record, '<Codex primary context>');
        if (
          total !== null &&
          (maximumTotalTokenUsage === null || total > maximumTotalTokenUsage)
        ) {
          maximumTotalTokenUsage = total;
        }
      }
    }
    lineStart = newline + 1;
    lineNumber += 1;
  }
  return previousPrompt ?? { byteOffset: 0, previousTotalTokenUsage: null };
}

function parseRecords(
  contents: string,
  filePath: string,
  firstLineNumber = 1,
): CodexRecord[] {
  const records: CodexRecord[] = [];
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error('record is not an object');
      records.push(parsed);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Invalid Codex JSONL at ${filePath}:${firstLineNumber + index}: ${message}`,
        { cause },
      );
    }
  }
  return records;
}

function isGenuinePrompt(record: CodexRecord): boolean {
  return record.type === 'event_msg' && record.payload?.type === 'user_message';
}

function openInteraction(
  record: CodexRecord,
  filePath: string,
): PendingInteraction {
  if (typeof record.timestamp !== 'string') {
    throw new Error(`Codex user_message has an invalid timestamp: ${filePath}`);
  }
  const timestamp = parseTimestamp(record.timestamp);
  if (timestamp === null) {
    throw new Error(`Codex user_message has an invalid timestamp: ${filePath}`);
  }
  return {
    interactionKey: record.timestamp,
    cwd: null,
    modelRaw: null,
    timestamp,
    hasAssistantResponse: false,
    hasTokenUsage: false,
    tokens: { ...nullTokens },
  };
}

function readTurnAttribution(
  record: CodexRecord,
  filePath: string,
): { cwd: string; modelRaw: string; turnId: string | null } {
  const cwd = record.payload?.cwd;
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error(`Codex turn_context has no cwd: ${filePath}`);
  }
  const modelRaw = record.payload?.model;
  if (typeof modelRaw !== 'string' || modelRaw.length === 0) {
    throw new Error(`Codex turn_context has no model: ${filePath}`);
  }
  const turnId = record.payload?.turn_id;
  return {
    cwd,
    modelRaw,
    turnId: typeof turnId === 'string' && turnId.length > 0 ? turnId : null,
  };
}

function readTotalTokenUsage(
  record: CodexRecord,
  filePath: string,
): number | null {
  const info = record.payload?.info;
  if (!isRecord(info) || info.total_token_usage === null) return null;
  if (!isRecord(info.total_token_usage)) {
    throw new Error(
      `Codex token_count has invalid total_token_usage: ${filePath}`,
    );
  }
  return requiredTokenCount(
    info.total_token_usage.total_tokens,
    'total_token_usage.total_tokens',
    filePath,
  );
}

function addLastTokenUsage(
  pending: PendingInteraction,
  record: CodexRecord,
  filePath: string,
) {
  const info = record.payload?.info;
  if (!isRecord(info) || info.last_token_usage === null) return;
  if (!isRecord(info.last_token_usage)) {
    throw new Error(
      `Codex token_count has invalid last_token_usage: ${filePath}`,
    );
  }
  const usage = info.last_token_usage;
  const input = requiredTokenCount(
    usage.input_tokens,
    'input_tokens',
    filePath,
  );
  const cachedInput = requiredTokenCount(
    usage.cached_input_tokens,
    'cached_input_tokens',
    filePath,
  );
  const output = requiredTokenCount(
    usage.output_tokens,
    'output_tokens',
    filePath,
  );
  if (cachedInput > input) {
    throw new Error(
      `Codex cached_input_tokens exceeds input_tokens: ${filePath}`,
    );
  }
  pending.tokens.input = (pending.tokens.input ?? 0) + input - cachedInput;
  pending.tokens.cacheRead = (pending.tokens.cacheRead ?? 0) + cachedInput;
  pending.tokens.output = (pending.tokens.output ?? 0) + output;
  pending.hasTokenUsage = true;
}

function requiredTokenCount(
  value: unknown,
  field: string,
  filePath: string,
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Codex ${field} is not a non-negative integer: ${filePath}`,
    );
  }
  return value;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
