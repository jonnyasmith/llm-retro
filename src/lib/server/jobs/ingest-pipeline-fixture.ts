import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import {
  openDatabase,
  type Connection,
  type Database,
} from '../database/connection';
import type { Harness } from '../../jobs/contracts';
import { persistSettings } from '../database/store';
import {
  createIngestHandler,
  type IdentifiedSession,
  type IngestAdapter,
  type IngestSourceFileGroup,
  type InteractionUpdate,
  type NormalisedInteraction,
  type NormalisedSession,
  type ParseSessionSliceInput,
  type ResumeBoundary,
  type SubTokenUpdateInput,
} from './ingest-pipeline';
import { nullTokenBuckets, type TokenBuckets } from './token-buckets';
import { findLastPromptBoundary } from './jsonl-scan';
import {
  literalCwdProjectResolver,
  type CwdProjectResolver,
} from './project-resolver';

// The fake adapter tags its rows with a real Harness value because Harness is a
// closed union; the pipeline treats it as an opaque label, so any member serves.
export const FAKE_HARNESS: Harness = 'claude';

const temporaryDirectories: string[] = [];

/** A temporary Store beside the log source directory a pipeline test reads. */
export interface PipelineFixture extends Connection {
  /** The temporary directory holding both the Store and the log source. */
  root: string;
  /** The sole log source the fake Harness enumerates session files from. */
  logSource: string;
}

export async function createPipelineFixture(): Promise<PipelineFixture> {
  const root = await mkdtemp(join(tmpdir(), 'llm-retro-ingest-pipeline-'));
  temporaryDirectories.push(root);
  const dataDirectory = join(root, 'data');
  const logSource = join(root, 'sessions');
  await mkdir(logSource, { recursive: true });
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  persistSettings(connection.database, {
    timezone: 'Asia/Kolkata',
    logSourceOverrides: { [FAKE_HARNESS]: [logSource] },
  });
  return { ...connection, root, logSource };
}

export async function cleanupPipelineFixtures() {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}

export interface FakeMetadata {
  stableSessionId: string;
  // Stands in for Codex's cumulative-token baseline: a resume boundary finder
  // may refine it, and every Interaction the slice yields is offset by it.
  outputTokenBase?: number;
}

/**
 * A canned-data adapter that satisfies the whole IngestAdapter contract
 * without any real Harness log format. Each behaviour under test is provoked by
 * varying the on-disk files and settings the pipeline reads, never by teaching
 * the adapter about the pipeline. A primary line is a JSON record describing one
 * Interaction (`{ key, cwd, ... }`); a line carrying `{ update, sub }` — in the
 * primary or any auxiliary file — is a sub-token backfill for an existing
 * Interaction, mirroring the auxiliary re-read the pipeline owns per ADR-0007.
 * Every Interaction line is a prompt boundary, so a resumed run restarts at the
 * last one, standing in for a Harness's `isGenuineUserPrompt`.
 */
export function createFakeAdapter(
  overrides: {
    enumerate?: (logSources: string[]) => Promise<IngestSourceFileGroup[]>;
    identify?: (
      primaryFilePath: string,
      primaryContents: Buffer,
    ) => IdentifiedSession<FakeMetadata>;
    findResumeBoundary?: (
      primaryContents: Buffer,
      beforeByteOffset: number,
      metadata: FakeMetadata,
    ) => ResumeBoundary<FakeMetadata>;
    readSubTokenUpdates?: (
      input: SubTokenUpdateInput<FakeMetadata>,
    ) => InteractionUpdate[];
  } = {},
): IngestAdapter<FakeMetadata> {
  return {
    harness: FAKE_HARNESS,
    enumerateSourceFileGroups: overrides.enumerate ?? defaultEnumerate,
    identifySession: overrides.identify ?? defaultIdentify,
    findResumeBoundary:
      overrides.findResumeBoundary ?? defaultFindResumeBoundary,
    parseSessionSlice: defaultParse,
    readSubTokenUpdates:
      overrides.readSubTokenUpdates ?? defaultReadSubTokenUpdates,
  };
}

export async function runPipeline(
  adapter: IngestAdapter<FakeMetadata>,
  database: Database,
  options: {
    correlationId?: string;
    resolveProject?: CwdProjectResolver;
    progress?: (progress: unknown) => void;
    log?: (message: string) => void;
  } = {},
): Promise<void> {
  const handler = createIngestHandler(adapter, {
    resolveProject: options.resolveProject ?? literalCwdProjectResolver,
  });
  await handler.run(null, {
    correlationId: options.correlationId ?? 'pipeline-test',
    database,
    progress: options.progress ?? (() => {}),
    log: options.log ?? (() => {}),
  });
}

export interface FakeInteractionRecord {
  key: string;
  cwd: string;
  model?: string;
  modelRaw?: string;
  main?: Partial<TokenBuckets>;
  sub?: Partial<TokenBuckets>;
  spawnedSubagents?: boolean;
  timestamp: number;
}

export async function writeLines(
  path: string,
  lines: Array<string | FakeInteractionRecord>,
  options: { trailingNewline?: boolean } = {},
): Promise<void> {
  const rendered = lines.map((line) =>
    typeof line === 'string' ? line : JSON.stringify(line),
  );
  await writeFile(
    path,
    rendered.join('\n') + (options.trailingNewline === false ? '' : '\n'),
  );
}

function toBuckets(partial?: Partial<TokenBuckets>): TokenBuckets {
  return { ...nullTokenBuckets(), ...partial };
}

async function defaultEnumerate(
  logSources: string[],
): Promise<IngestSourceFileGroup[]> {
  const groups: IngestSourceFileGroup[] = [];
  for (const source of logSources) {
    const entries = (await readdir(source))
      .filter((entry) => entry.endsWith('.log'))
      .sort();
    for (const entry of entries) {
      groups.push({
        primaryFilePath: join(source, entry),
        auxiliaryFilePaths: [],
      });
    }
  }
  return groups;
}

function defaultIdentify(
  primaryFilePath: string,
): IdentifiedSession<FakeMetadata> {
  const stableSessionId = basename(primaryFilePath, extname(primaryFilePath));
  return { stableSessionId, metadata: { stableSessionId } };
}

function defaultFindResumeBoundary(
  primaryContents: Buffer,
  beforeByteOffset: number,
  metadata: FakeMetadata,
): ResumeBoundary<FakeMetadata> {
  return {
    byteOffset: findLastPromptBoundary(
      primaryContents,
      beforeByteOffset,
      (line) => typeof JSON.parse(line).update !== 'string',
    ),
    metadata,
  };
}

function defaultParse({
  primaryContents,
  metadata,
}: ParseSessionSliceInput<FakeMetadata>): NormalisedSession | null {
  const interactions: NormalisedInteraction[] = [];
  for (const record of parseFakeRecords(primaryContents)) {
    if (typeof record.update === 'string') continue;
    const interaction = toInteraction(record);
    if (interaction.mainTokens.output !== null) {
      interaction.mainTokens.output += metadata.outputTokenBase ?? 0;
    }
    interactions.push(interaction);
  }
  if (interactions.length === 0) return null;
  const timestamps = interactions.map((interaction) => interaction.timestamp);
  return {
    startedAt: Math.min(...timestamps),
    endedAt: Math.max(...timestamps),
    interactions,
  };
}

function defaultReadSubTokenUpdates({
  completePrimaryContents,
  auxiliaryFiles,
}: SubTokenUpdateInput<FakeMetadata>): InteractionUpdate[] {
  const updates: InteractionUpdate[] = [];
  const sources = [
    completePrimaryContents,
    ...auxiliaryFiles.map((auxiliary) => auxiliary.contents),
  ];
  for (const source of sources) {
    for (const record of parseFakeRecords(source)) {
      if (typeof record.update === 'string') {
        updates.push({
          interactionKey: record.update,
          subTokens: toBuckets(record.sub),
        });
      }
    }
  }
  return updates;
}

function parseFakeRecords(
  contents: string,
): Array<FakeInteractionRecord & { update?: string }> {
  return contents
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function toInteraction(record: FakeInteractionRecord): NormalisedInteraction {
  return {
    interactionKey: record.key,
    cwd: record.cwd,
    model: record.model ?? 'fake-model',
    modelRaw: record.modelRaw ?? record.model ?? 'fake-model-raw',
    mainTokens: toBuckets(record.main),
    subTokens: toBuckets(record.sub),
    spawnedSubagents: record.spawnedSubagents ?? false,
    timestamp: record.timestamp,
  };
}
