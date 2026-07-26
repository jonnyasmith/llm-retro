import { harnessLabels, type Harness } from '../../jobs/contracts';
import type { NormalisedInteraction } from './ingest-pipeline';
import { parseTimestamp } from './jsonl-records';
import { findLastPromptBoundary } from './jsonl-scan';
import { resolveServingModel, type ModelCandidate } from '../model';
import {
  accumulateTokens,
  nullTokenBuckets,
  type TokenBuckets,
} from './token-buckets';

/**
 * The Interaction accumulator (ADR-0008): shared by pi, omp, and Claude, and
 * deliberately not by Codex. It must never branch on which Harness it is
 * serving — the `harness` a dialect carries names that Harness in errors and
 * nowhere else.
 */

/** The part of a record this module reads directly: where Model and usage sit. */
export interface UsageRecord {
  message?: {
    model?: unknown;
    usage?: Record<string, unknown>;
  };
}

/** The part of a record the timestamp-envelope fold reads. */
export interface TimestampedRecord {
  timestamp?: unknown;
}

/** Which wire field of a record's `usage` feeds which Token usage bucket. */
export type TokenWireKeys = ReadonlyArray<
  readonly [keyof TokenBuckets, string]
>;

/** What varies per Session rather than per Harness. */
export interface SessionContext {
  /** Named by every error raised while reading this Session. */
  filePath: string;
  /**
   * The cwd an Interaction takes when its own prompt carries none. A Harness
   * whose prompts must carry their own — Claude rejects one that does not — has
   * no fallback to offer and passes the empty string.
   */
  defaultCwd: string;
}

/** A genuine prompt and what followed it, before Model and tokens are settled. */
export interface PendingInteraction<LogRecord> {
  interactionKey: string;
  cwd: string;
  timestamp: number;
  /** Main-agent responses: they vote on the serving Model and fill `mainTokens`. */
  assistants: LogRecord[];
  /** Everything after the prompt and before the next one, assistants included. */
  records: LogRecord[];
}

/**
 * Everything the accumulator needs to know about one Harness. Declared once at
 * module scope per log reader, so ingesting a Session allocates no dialect.
 */
export interface InteractionDialect<LogRecord extends UsageRecord> {
  /** Names this Harness in the errors the accumulator raises. */
  harness: Harness;
  /** ADR-0001's genuine-prompt rule as this Harness spells it. */
  isGenuinePrompt(record: LogRecord): boolean;
  /** A main-agent response, as opposed to a sub-agent's or a tool's. */
  isMainAssistant(record: LogRecord): boolean;
  /** Read a genuine prompt's key, cwd, and timestamp, or reject it as corrupt. */
  openInteraction(
    record: LogRecord,
    context: SessionContext,
  ): PendingInteraction<LogRecord>;
  /** The Harness-shaped half of token extraction; the rule itself is shared. */
  tokenWireKeys: TokenWireKeys;
  /** The `usage` field the serving-Model rule counts as a Model's output. */
  outputWireKey: string;
  parseRecord(line: string, filePath: string, lineNumber: number): LogRecord;
}

/** An Interaction's sub-agent activity, as far as its Harness can account for it. */
export interface SubagentUsage {
  subTokens: TokenBuckets;
  /** Sub-agents ran whose Token usage this Harness never logged (ADR-0008). */
  spawnedSubagents: boolean;
}

/**
 * How one Session discloses an Interaction's sub-agent activity. Built once per
 * Session — Claude's closes over its agent records, omp's over its parsed agent
 * logs, pi's over nothing at all — and never per Interaction.
 */
export type SubagentDisclosure<LogRecord> = (
  pending: PendingInteraction<LogRecord>,
) => SubagentUsage;

/** The span of wall-clock time a Session's records cover. */
export interface TimestampEnvelope {
  startedAt: number | null;
  endedAt: number | null;
}

/**
 * How a Harness's sub-agent logs hang together. Each Harness keeps its own
 * topology (ADR-0008) and shares only the walk over it.
 */
export interface SubagentTopology<Reference, Node, LogRecord> {
  /** The node a reference names, scoped by the node that spawned it. */
  resolve(reference: Reference, parent: Node | null): Node | null;
  /** A node's identity, so a repeated or cyclic reference is walked once. */
  keyOf(node: Node): string;
  /** The assistant records whose Token usage this node contributes. */
  assistantsOf(node: Node): readonly LogRecord[];
  /** The sub-agents this node itself spawned and saw complete. */
  childrenOf(node: Node): readonly Reference[];
}

/**
 * Every Interaction a record list opens and answers. A prompt nothing responded
 * to is not an Interaction and is dropped, including the one left open at the
 * end of a slice.
 */
export function accumulateInteractions<LogRecord extends UsageRecord>(
  records: readonly LogRecord[],
  dialect: InteractionDialect<LogRecord>,
  context: SessionContext,
): PendingInteraction<LogRecord>[] {
  const complete: PendingInteraction<LogRecord>[] = [];
  let pending: PendingInteraction<LogRecord> | null = null;
  for (const record of records) {
    if (dialect.isGenuinePrompt(record)) {
      if (pending && pending.assistants.length > 0) complete.push(pending);
      pending = dialect.openInteraction(record, context);
      continue;
    }
    if (!pending) continue;
    pending.records.push(record);
    if (dialect.isMainAssistant(record)) pending.assistants.push(record);
  }
  if (pending && pending.assistants.length > 0) complete.push(pending);
  return complete;
}

/**
 * Settle each pending Interaction into the shape the pipeline stores: which
 * Model served it, what the main agent spent, and what its sub-agents did.
 */
export function normaliseInteractions<LogRecord extends UsageRecord>(
  pendingInteractions: readonly PendingInteraction<LogRecord>[],
  dialect: InteractionDialect<LogRecord>,
  filePath: string,
  disclose: SubagentDisclosure<LogRecord>,
): NormalisedInteraction[] {
  return pendingInteractions.map((pending) => {
    const candidates: ModelCandidate[] = [];
    for (const assistant of pending.assistants) {
      const modelRaw = assistant.message?.model;
      if (typeof modelRaw !== 'string' || modelRaw.length === 0) continue;
      const outputTokens = assistant.message?.usage?.[dialect.outputWireKey];
      candidates.push({
        modelRaw,
        outputTokens: typeof outputTokens === 'number' ? outputTokens : 0,
      });
    }
    const serving = resolveServingModel(candidates);
    if (serving === null) {
      throw new Error(
        `Responded ${harnessLabels[dialect.harness]} Interaction has no model: ${filePath}`,
      );
    }
    const subagents = disclose(pending);
    return {
      interactionKey: pending.interactionKey,
      cwd: pending.cwd,
      model: serving.model,
      modelRaw: serving.modelRaw,
      mainTokens: sumTokens(pending.assistants, dialect),
      subTokens: subagents.subTokens,
      spawnedSubagents: subagents.spawnedSubagents,
      timestamp: pending.timestamp,
    };
  });
}

/**
 * Every value these records report, folded into buckets under the null-not-zero
 * rule. The rule is `token-buckets`'; this only knows where a Harness wrote it.
 */
export function sumTokens<LogRecord extends UsageRecord>(
  records: readonly LogRecord[],
  dialect: InteractionDialect<LogRecord>,
): TokenBuckets {
  const buckets = nullTokenBuckets();
  for (const record of records) {
    for (const [bucket, wireKey] of dialect.tokenWireKeys) {
      accumulateTokens(buckets, bucket, record.message?.usage?.[wireKey]);
    }
  }
  return buckets;
}

/**
 * The widest span a Session's records cover, seeded with whatever its metadata
 * already knew — pi and omp seed the Session record's timestamp, Claude has no
 * metadata record and seeds nothing.
 */
export function foldTimestampEnvelope(
  records: readonly TimestampedRecord[],
  seed: number | null,
): TimestampEnvelope {
  let startedAt = seed;
  let endedAt = seed;
  for (const record of records) {
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp === null) continue;
    startedAt = startedAt === null ? timestamp : Math.min(startedAt, timestamp);
    endedAt = endedAt === null ? timestamp : Math.max(endedAt, timestamp);
  }
  return { startedAt, endedAt };
}

/**
 * The byte offset of the last genuine prompt at or before `beforeByteOffset`,
 * or zero when the slice holds none — where a resumed read must begin so that
 * an Interaction is never split across two Checkpoints.
 */
export function findPromptBoundary<LogRecord extends UsageRecord>(
  contents: Buffer,
  beforeByteOffset: number,
  dialect: InteractionDialect<LogRecord>,
): number {
  const filePath = `<${harnessLabels[dialect.harness]} primary context>`;
  return findLastPromptBoundary(
    contents,
    beforeByteOffset,
    (line, lineNumber) =>
      dialect.isGenuinePrompt(dialect.parseRecord(line, filePath, lineNumber)),
  );
}

/**
 * Depth-first over the sub-agents beneath the given roots, collecting every
 * assistant record they produced.
 *
 * A reference is resolved *before* it is marked visited, because only a resolved
 * node has an identity every topology can key on — omp's names repeat between
 * parents, so its references cannot be keys. An unresolvable reference
 * contributes no records and no children either way; re-encountering one merely
 * re-fails a lookup.
 */
export function foldSubagentTree<Reference, Node, LogRecord>(
  roots: readonly Reference[],
  topology: SubagentTopology<Reference, Node, LogRecord>,
): LogRecord[] {
  const assistants: LogRecord[] = [];
  const visited = new Set<string>();

  const visit = (reference: Reference, parent: Node | null) => {
    const node = topology.resolve(reference, parent);
    if (node === null) return;
    const key = topology.keyOf(node);
    if (visited.has(key)) return;
    visited.add(key);
    for (const record of topology.assistantsOf(node)) assistants.push(record);
    for (const child of topology.childrenOf(node)) visit(child, node);
  };

  for (const root of roots) visit(root, null);
  return assistants;
}
