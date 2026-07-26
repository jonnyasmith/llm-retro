import { harnessLabels, type Harness } from '../../jobs/contracts';
import type {
  IngestSourceContents,
  NormalisedSession,
} from './ingest-pipeline';
import {
  accumulateInteractions,
  findPromptBoundary,
  foldTimestampEnvelope,
  normaliseInteractions,
  type InteractionDialect,
  type SubagentDisclosure,
} from './interaction-accumulator';
import { isRecord, parseJsonlRecords, parseTimestamp } from './jsonl-records';
import { nullTokenBuckets } from './token-buckets';

/** The pi wire format, which omp's records also use (ADR-0008). */
export interface PiRecord {
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

export interface PiSessionMetadata {
  stableSessionId: string;
  cwd: string;
  timestamp: number | null;
}

/** The pi grammar bound to one pi-shaped Harness. */
export interface PiGrammar {
  dialect: InteractionDialect<PiRecord>;
  parseRecords(
    contents: string,
    filePath: string,
    firstLineNumber?: number,
  ): PiRecord[];
  readSessionMetadata(filePath: string, contents: Buffer): PiSessionMetadata;
  readSession(
    filePath: string,
    contents: string,
    auxiliaryFiles: IngestSourceContents[],
    metadata: PiSessionMetadata,
  ): NormalisedSession;
  findPromptBoundary(contents: Buffer, beforeByteOffset: number): number;
}

export interface PiGrammarOptions {
  harness: Harness;
  /**
   * pi writes the `session` record first and reads only that line; omp may
   * precede it with a `title` record and so searches every complete line.
   */
  sessionRecordIsFirst: boolean;
  /** How this Harness accounts for an Interaction's sub-agents, if at all. */
  discloseSubagents(
    records: PiRecord[],
    auxiliaryFiles: IngestSourceContents[],
    filePath: string,
  ): SubagentDisclosure<PiRecord>;
}

// The only Harness-shaped part of token extraction: which wire field is which
// bucket. The output key is named because the serving-Model rule needs it too.
const outputWireKey = 'output';

export function createPiGrammar({
  harness,
  sessionRecordIsFirst,
  discloseSubagents,
}: PiGrammarOptions): PiGrammar {
  const label = harnessLabels[harness];
  const parseRecords = (
    contents: string,
    filePath: string,
    firstLineNumber = 1,
  ) =>
    parseJsonlRecords<PiRecord>(harness, contents, filePath, firstLineNumber);

  const dialect: InteractionDialect<PiRecord> = {
    harness,
    isGenuinePrompt: (record) =>
      record.type === 'message' && record.message?.role === 'user',
    isMainAssistant: (record) =>
      record.type === 'message' && record.message?.role === 'assistant',
    openInteraction(record, { filePath, defaultCwd }) {
      if (typeof record.id !== 'string' || record.id.length === 0) {
        throw new Error(`Genuine ${label} user message has no id: ${filePath}`);
      }
      const timestamp = parseTimestamp(record.timestamp);
      if (timestamp === null) {
        throw new Error(
          `Genuine ${label} user message has an invalid timestamp: ${filePath}`,
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
    },
    tokenWireKeys: [
      ['input', 'input'],
      ['output', outputWireKey],
      ['cacheRead', 'cacheRead'],
      ['cacheWrite', 'cacheWrite'],
    ],
    outputWireKey,
    parseRecord: (line, filePath, lineNumber) =>
      parseRecords(line, filePath, lineNumber)[0],
  };

  return {
    dialect,
    parseRecords,

    readSessionMetadata(filePath, contents) {
      let session: PiRecord | undefined;
      if (sessionRecordIsFirst) {
        const newline = contents.indexOf(10);
        if (newline === -1) {
          throw new Error(
            `${label} session has no complete metadata record: ${filePath}`,
          );
        }
        session = parseRecords(
          contents.subarray(0, newline).toString('utf8'),
          filePath,
        )[0];
        if (session.type !== 'session') {
          throw new Error(
            `${label} session does not start with a session record: ${filePath}`,
          );
        }
      } else {
        const completeByteOffset = contents.lastIndexOf(10) + 1;
        session = parseRecords(
          contents.subarray(0, completeByteOffset).toString('utf8'),
          filePath,
        ).find((record) => record.type === 'session');
        if (!session) {
          throw new Error(
            `${label} session has no complete session record: ${filePath}`,
          );
        }
      }
      if (typeof session.id !== 'string' || session.id.length === 0) {
        throw new Error(`${label} session record has no id: ${filePath}`);
      }
      if (typeof session.cwd !== 'string' || session.cwd.length === 0) {
        throw new Error(`${label} session record has no cwd: ${filePath}`);
      }
      return {
        stableSessionId: session.id,
        cwd: session.cwd,
        timestamp: parseTimestamp(session.timestamp),
      };
    },

    readSession(filePath, contents, auxiliaryFiles, metadata) {
      const records = parseRecords(contents, filePath);
      const disclose = discloseSubagents(records, auxiliaryFiles, filePath);
      const { startedAt, endedAt } = foldTimestampEnvelope(
        records,
        metadata.timestamp,
      );
      const pendingInteractions = accumulateInteractions(records, dialect, {
        filePath,
        defaultCwd: metadata.cwd,
      });
      return {
        startedAt,
        endedAt,
        interactions: normaliseInteractions(
          pendingInteractions,
          dialect,
          filePath,
          disclose,
        ),
      };
    },

    findPromptBoundary: (contents, beforeByteOffset) =>
      findPromptBoundary(contents, beforeByteOffset, dialect),
  };
}

/**
 * pi never logs sub-agent Token usage (ADR-0008), so an Interaction can only
 * disclose that its total is a floor rather than a full accounting.
 */
const disclosePiSubagents: SubagentDisclosure<PiRecord> = (pending) => ({
  subTokens: nullTokenBuckets(),
  spawnedSubagents: pending.records.some(spawnedSubagent),
});

export const piGrammar = createPiGrammar({
  harness: 'pi',
  sessionRecordIsFirst: true,
  discloseSubagents: () => disclosePiSubagents,
});

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
