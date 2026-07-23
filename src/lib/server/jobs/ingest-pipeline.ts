import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  rename,
  rm,
  stat,
  type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Harness } from '../database/store';
import {
  checkpoints,
  interactions,
  projects,
  sessions,
} from '../database/schema';
import { getSettings } from '../database/store';
import { deriveLocalBuckets } from '../database/time-buckets';
import {
  resolveGitProject,
  type CwdProjectResolver,
  type ResolvedProject,
} from './project-resolver';
import type { JobHandler } from './types';

export interface TokenBuckets {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
}

export interface NormalisedInteraction {
  interactionKey: string;
  cwd: string;
  model: string;
  modelRaw: string;
  mainTokens: TokenBuckets;
  subTokens: TokenBuckets;
  spawnedSubagents: boolean;
  timestamp: number;
}

export interface NormalisedSession {
  startedAt: number | null;
  endedAt: number | null;
  interactions: NormalisedInteraction[];
}

export interface InteractionUpdate {
  interactionKey: string;
  subTokens: TokenBuckets;
}

export interface IngestSourceFileGroup {
  primaryFilePath: string;
  auxiliaryFilePaths: string[];
}

export interface IngestSourceContents {
  filePath: string;
  contents: string;
}

export interface IdentifiedSession<Metadata> {
  stableSessionId: string;
  metadata: Metadata;
}

export interface ParseSessionSliceInput<Metadata> {
  primaryFilePath: string;
  primaryContents: string;
  completePrimaryContents: Buffer;
  completeByteOffset: number;
  startByteOffset: number;
  auxiliaryFiles: IngestSourceContents[];
  metadata: Metadata;
}

export interface ParsedSessionSlice {
  session: NormalisedSession | null;
  interactionUpdates: InteractionUpdate[];
}

export interface IngestAdapter<Metadata> {
  harness: Harness;
  displayName: string;
  enumerateSourceFileGroups(
    logSources: string[],
  ): Promise<IngestSourceFileGroup[]>;
  identifySession(
    primaryFilePath: string,
    primaryContents: Buffer,
  ): IdentifiedSession<Metadata>;
  parseSessionSlice(
    input: ParseSessionSliceInput<Metadata>,
  ): ParsedSessionSlice;
}

type ArchivedFileRename = (oldPath: string, newPath: string) => Promise<void>;

export function createIngestHandler<Metadata>(
  adapter: IngestAdapter<Metadata>,
  options: {
    resolveProject?: CwdProjectResolver;
    renameArchivedFile?: ArchivedFileRename;
  } = {},
): JobHandler<null> {
  const resolveProject = options.resolveProject ?? resolveGitProject;
  const renameArchivedFile = options.renameArchivedFile ?? rename;

  return {
    async run(_payload, context) {
      const settings = getSettings(context.database);
      const archiveRoot = resolveRawArchiveRoot(
        settings.rawArchiveEnabled,
        settings.rawArchivePath,
      );
      const sourceFileGroups = await adapter.enumerateSourceFileGroups(
        settings.logSources[adapter.harness],
      );
      const resolvedProjects = new Map<string, ResolvedProject>();
      context.progress({ filesTotal: sourceFileGroups.length, filesDone: 0 });
      context.log(
        `Found ${sourceFileGroups.length} ${adapter.displayName} session files`,
      );

      for (const [index, sourceFileGroup] of sourceFileGroups.entries()) {
        const filePath = sourceFileGroup.primaryFilePath;
        context.progress({
          filesTotal: sourceFileGroups.length,
          filesDone: index,
          currentFile: filePath,
        });
        context.log(`Reading ${filePath}`);

        const primarySnapshot = await readStableSourceFile(filePath);
        const auxiliarySnapshots = await Promise.all(
          sourceFileGroup.auxiliaryFilePaths.map(readStableSourceFile),
        );
        const { stableSessionId, metadata } = adapter.identifySession(
          filePath,
          primarySnapshot.contents,
        );

        if (archiveRoot !== null) {
          for (const source of [primarySnapshot, ...auxiliarySnapshots]) {
            await archiveSourceFile(
              archiveRoot,
              adapter.harness,
              source,
              renameArchivedFile,
            );
          }
        }

        const completeByteOffset = primarySnapshot.contents.lastIndexOf(10) + 1;
        const storedCheckpoint = context.database
          .select()
          .from(checkpoints)
          .where(
            and(
              eq(checkpoints.harness, adapter.harness),
              eq(checkpoints.stableSessionId, stableSessionId),
            ),
          )
          .get();
        const existingSession = context.database
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.harness, adapter.harness),
              eq(sessions.stableSessionId, stableSessionId),
            ),
          )
          .get();
        const metadataMatches =
          storedCheckpoint?.fileSize === primarySnapshot.fileSize &&
          storedCheckpoint.fileMtime === primarySnapshot.fileMtime;
        if (
          metadataMatches &&
          auxiliarySnapshots.length === 0 &&
          existingSession?.logFilePath === filePath
        ) {
          context.log(`Skipped unchanged ${filePath}`);
          context.progress({
            filesTotal: sourceFileGroups.length,
            filesDone: index + 1,
          });
          continue;
        }

        const canResumeGrowth =
          storedCheckpoint !== undefined &&
          primarySnapshot.fileSize > storedCheckpoint.fileSize &&
          storedCheckpoint.lastCompleteRecordByteOffset <= completeByteOffset;
        const startByteOffset = metadataMatches
          ? completeByteOffset
          : canResumeGrowth
            ? storedCheckpoint.lastCompleteRecordByteOffset
            : 0;
        const parsed = adapter.parseSessionSlice({
          primaryFilePath: filePath,
          primaryContents: primarySnapshot.contents
            .subarray(startByteOffset, completeByteOffset)
            .toString('utf8'),
          completePrimaryContents: primarySnapshot.contents,
          completeByteOffset,
          startByteOffset,
          auxiliaryFiles: auxiliarySnapshots.map(toSourceContents),
          metadata,
        });

        const cwds = new Set(
          parsed.session?.interactions.map((interaction) => interaction.cwd) ??
            [],
        );
        for (const cwd of cwds) {
          if (!resolvedProjects.has(cwd)) {
            resolvedProjects.set(cwd, await resolveProject(cwd));
          }
        }

        storeSessionSlice(
          context.database,
          adapter,
          stableSessionId,
          filePath,
          parsed,
          resolvedProjects,
          settings.timezone,
          existingSession,
          startByteOffset > 0,
          {
            lastCompleteRecordByteOffset: completeByteOffset,
            fileSize: primarySnapshot.fileSize,
            fileMtime: primarySnapshot.fileMtime,
          },
        );
        context.log(`Ingested ${filePath}`);
        context.progress({
          filesTotal: sourceFileGroups.length,
          filesDone: index + 1,
        });
      }
    },
  };
}

interface SourceSnapshot {
  filePath: string;
  contents: Buffer;
  fileSize: number;
  fileMtime: number;
  atime: Date;
  mtime: Date;
}

async function readStableSourceFile(filePath: string): Promise<SourceSnapshot> {
  const fileHandle = await open(filePath, 'r');
  try {
    const before = await fileHandle.stat();
    const contents = await fileHandle.readFile();
    const after = await fileHandle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`File changed while it was being read: ${filePath}`);
    }
    return {
      filePath,
      contents,
      fileSize: after.size,
      fileMtime: Math.trunc(after.mtimeMs),
      atime: after.atime,
      mtime: after.mtime,
    };
  } finally {
    await fileHandle.close();
  }
}

function resolveRawArchiveRoot(
  enabled: boolean,
  configuredPath: string | null,
): string | null {
  if (!enabled) return null;
  if (configuredPath === null || configuredPath.trim().length === 0) {
    throw new Error('Raw archive is enabled but no archive path is configured');
  }
  return resolve(configuredPath);
}

async function archiveSourceFile(
  archiveRoot: string,
  harness: Harness,
  source: SourceSnapshot,
  renameArchivedFile: ArchivedFileRename,
): Promise<void> {
  const destination = rawArchiveDestination(
    archiveRoot,
    harness,
    source.filePath,
  );
  try {
    const archived = await stat(destination);
    if (
      archived.size === source.fileSize &&
      Math.abs(archived.mtimeMs - source.fileMtime) < 1
    ) {
      return;
    }
  } catch (cause) {
    if (!isMissingPath(cause)) throw cause;
  }

  await mkdir(dirname(destination), { recursive: true });
  const temporaryPath = join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.tmp`,
  );
  let temporaryHandle: FileHandle | undefined;
  try {
    temporaryHandle = await open(temporaryPath, 'wx');
    await temporaryHandle.writeFile(source.contents);
    await temporaryHandle.utimes(source.atime, source.mtime);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await renameArchivedFile(temporaryPath, destination);
  } finally {
    try {
      await temporaryHandle?.close();
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

function rawArchiveDestination(
  archiveRoot: string,
  harness: Harness,
  sourcePath: string,
) {
  const absoluteSource = resolve(sourcePath);
  const filesystemRoot = parse(absoluteSource).root;
  return join(
    archiveRoot,
    harness,
    Buffer.from(filesystemRoot).toString('base64url'),
    relative(filesystemRoot, absoluteSource),
  );
}

function toSourceContents(snapshot: SourceSnapshot): IngestSourceContents {
  return {
    filePath: snapshot.filePath,
    contents: snapshot.contents.toString('utf8'),
  };
}

function storeSessionSlice<Metadata>(
  database: Parameters<JobHandler<null>['run']>[1]['database'],
  adapter: IngestAdapter<Metadata>,
  stableSessionId: string,
  logFilePath: string,
  parsed: ParsedSessionSlice,
  resolvedProjects: Map<string, ResolvedProject>,
  timezone: string,
  existingSession: typeof sessions.$inferSelect | undefined,
  resumingPrimary: boolean,
  checkpoint: {
    lastCompleteRecordByteOffset: number;
    fileSize: number;
    fileMtime: number;
  },
): void {
  database.transaction((transaction) => {
    const projectIds = new Map<string, number>();
    const sessionCwds = new Set(
      parsed.session?.interactions.map((interaction) => interaction.cwd) ?? [],
    );
    for (const cwd of sessionCwds) {
      const resolvedProject = resolvedProjects.get(cwd);
      if (!resolvedProject) {
        throw new Error(`Project was not resolved for cwd: ${cwd}`);
      }
      transaction
        .insert(projects)
        .values(resolvedProject)
        .onConflictDoUpdate({
          target: projects.rootPath,
          set: { gitRemoteUrl: resolvedProject.gitRemoteUrl },
        })
        .run();
      const project = transaction
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.rootPath, resolvedProject.rootPath))
        .get();
      if (!project) {
        throw new Error(`Project was not stored: ${resolvedProject.rootPath}`);
      }
      projectIds.set(cwd, project.id);
    }

    if (parsed.session) {
      const startedAt = resumingPrimary
        ? minimumTimestamp(
            existingSession?.startedAt ?? null,
            parsed.session.startedAt,
          )
        : parsed.session.startedAt;
      const endedAt = resumingPrimary
        ? maximumTimestamp(
            existingSession?.endedAt ?? null,
            parsed.session.endedAt,
          )
        : parsed.session.endedAt;
      transaction
        .insert(sessions)
        .values({
          harness: adapter.harness,
          stableSessionId,
          projectId: existingSession?.projectId ?? null,
          logFilePath,
          startedAt,
          endedAt,
        })
        .onConflictDoUpdate({
          target: [sessions.harness, sessions.stableSessionId],
          set: { logFilePath, startedAt, endedAt },
        })
        .run();
    } else if (existingSession && existingSession.logFilePath !== logFilePath) {
      transaction
        .update(sessions)
        .set({ logFilePath })
        .where(eq(sessions.id, existingSession.id))
        .run();
    }

    const session = transaction
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.harness, adapter.harness),
          eq(sessions.stableSessionId, stableSessionId),
        ),
      )
      .get();
    if (!session && (parsed.session || parsed.interactionUpdates.length > 0)) {
      throw new Error(
        `${adapter.displayName} Session was not stored: ${stableSessionId}`,
      );
    }
    if (session && !resumingPrimary) {
      transaction
        .delete(interactions)
        .where(eq(interactions.sessionId, session.id))
        .run();
    }

    for (const interaction of parsed.session?.interactions ?? []) {
      if (!session) {
        throw new Error(
          `${adapter.displayName} Session was not stored: ${stableSessionId}`,
        );
      }
      const projectId = projectIds.get(interaction.cwd);
      if (projectId === undefined) {
        throw new Error(
          `Interaction Project was not stored: ${interaction.cwd}`,
        );
      }
      const derived = {
        projectId,
        model: interaction.model,
        modelRaw: interaction.modelRaw,
        mainInputTokens: interaction.mainTokens.input,
        mainOutputTokens: interaction.mainTokens.output,
        mainCacheReadTokens: interaction.mainTokens.cacheRead,
        mainCacheWriteTokens: interaction.mainTokens.cacheWrite,
        subInputTokens: interaction.subTokens.input,
        subOutputTokens: interaction.subTokens.output,
        subCacheReadTokens: interaction.subTokens.cacheRead,
        subCacheWriteTokens: interaction.subTokens.cacheWrite,
        spawnedSubagents: interaction.spawnedSubagents,
        timestamp: interaction.timestamp,
        ...deriveLocalBuckets(interaction.timestamp, timezone),
      };
      transaction
        .insert(interactions)
        .values({
          sessionId: session.id,
          interactionKey: interaction.interactionKey,
          harness: adapter.harness,
          ...derived,
        })
        .onConflictDoUpdate({
          target: [interactions.sessionId, interactions.interactionKey],
          set: derived,
        })
        .run();
    }

    if (session) {
      for (const update of parsed.interactionUpdates) {
        transaction
          .update(interactions)
          .set({
            subInputTokens: update.subTokens.input,
            subOutputTokens: update.subTokens.output,
            subCacheReadTokens: update.subTokens.cacheRead,
            subCacheWriteTokens: update.subTokens.cacheWrite,
          })
          .where(
            and(
              eq(interactions.sessionId, session.id),
              eq(interactions.interactionKey, update.interactionKey),
            ),
          )
          .run();
      }

      if (parsed.session) {
        const interactionProjects = transaction
          .select({ projectId: interactions.projectId })
          .from(interactions)
          .where(eq(interactions.sessionId, session.id))
          .all();
        const firstProjectId = interactionProjects[0]?.projectId;
        const sessionProjectId =
          firstProjectId !== undefined &&
          interactionProjects.every(
            (interaction) => interaction.projectId === firstProjectId,
          )
            ? firstProjectId
            : null;
        transaction
          .update(sessions)
          .set({ projectId: sessionProjectId })
          .where(eq(sessions.id, session.id))
          .run();
      }
    }

    transaction
      .insert(checkpoints)
      .values({ harness: adapter.harness, stableSessionId, ...checkpoint })
      .onConflictDoUpdate({
        target: [checkpoints.harness, checkpoints.stableSessionId],
        set: checkpoint,
      })
      .run();
  });
}

function isMissingPath(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === 'ENOENT'
  );
}

function minimumTimestamp(left: number | null, right: number | null) {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function maximumTimestamp(left: number | null, right: number | null) {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}
