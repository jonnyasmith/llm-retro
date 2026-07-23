import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/connection';
import {
  checkpoints,
  interactions,
  projects,
  sessions,
} from '../database/schema';
import { getSettings } from '../database/store';
import { deriveLocalBuckets } from '../database/time-buckets';
import {
  findPiInteractionContextByteOffset,
  readPiSession,
  readPiSessionMetadata,
  type NormalisedPiSession,
} from './pi-adapter';
import {
  resolveGitProject,
  type CwdProjectResolver,
  type ResolvedProject,
} from './project-resolver';
import type { Job, JobHandler } from './types';

export {
  literalCwdProjectResolver,
  resolveGitProject,
  type CwdProjectResolver,
  type ResolvedProject,
} from './project-resolver';

type ArchivedFileRename = (oldPath: string, newPath: string) => Promise<void>;

export function createPiIngestJob(): Job<null> {
  return {
    identity: { type: 'ingest', scope: 'pi' },
    payload: null,
  };
}

export function createPiIngestHandler(
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
      const filePaths = await discoverSessionFiles(settings.logSources.pi);
      const resolvedProjects = new Map<string, ResolvedProject>();
      context.progress({ filesTotal: filePaths.length, filesDone: 0 });
      context.log(`Found ${filePaths.length} pi session files`);

      for (const [index, filePath] of filePaths.entries()) {
        context.progress({
          filesTotal: filePaths.length,
          filesDone: index,
          currentFile: filePath,
        });
        context.log(`Reading ${filePath}`);
        const snapshot = await readStableSourceFile(filePath);
        const metadata = readPiSessionMetadata(filePath, snapshot.contents);
        const stableSessionId = metadata.stableSessionId;
        if (archiveRoot !== null) {
          await archiveSourceFile(archiveRoot, snapshot, renameArchivedFile);
        }
        const completeByteOffset = snapshot.contents.lastIndexOf(10) + 1;
        const storedCheckpoint = context.database
          .select()
          .from(checkpoints)
          .where(
            and(
              eq(checkpoints.harness, 'pi'),
              eq(checkpoints.stableSessionId, stableSessionId),
            ),
          )
          .get();
        const existingSession = context.database
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.harness, 'pi'),
              eq(sessions.stableSessionId, stableSessionId),
            ),
          )
          .get();
        const metadataMatches =
          storedCheckpoint?.fileSize === snapshot.fileSize &&
          storedCheckpoint.fileMtime === snapshot.fileMtime;
        if (metadataMatches) {
          context.log(`Skipped unchanged ${filePath}`);
          context.progress({
            filesTotal: filePaths.length,
            filesDone: index + 1,
          });
          continue;
        }

        const canResumeGrowth =
          storedCheckpoint !== undefined &&
          snapshot.fileSize > storedCheckpoint.fileSize &&
          storedCheckpoint.lastCompleteRecordByteOffset <= completeByteOffset;
        const startByteOffset = canResumeGrowth
          ? storedCheckpoint.lastCompleteRecordByteOffset
          : 0;
        let parsed = readPiSession(
          filePath,
          snapshot.contents
            .subarray(startByteOffset, completeByteOffset)
            .toString('utf8'),
          metadata,
        );
        if (parsed.requiresInteractionContext && startByteOffset > 0) {
          const contextByteOffset = findPiInteractionContextByteOffset(
            snapshot.contents,
            startByteOffset,
          );
          parsed = readPiSession(
            filePath,
            snapshot.contents
              .subarray(contextByteOffset, completeByteOffset)
              .toString('utf8'),
            metadata,
          );
        }
        const cwds = new Set([
          parsed.cwd,
          ...parsed.interactions.map((interaction) => interaction.cwd),
        ]);
        for (const cwd of cwds) {
          if (!resolvedProjects.has(cwd)) {
            resolvedProjects.set(cwd, await resolveProject(cwd));
          }
        }

        storeSession(
          context.database,
          stableSessionId,
          filePath,
          parsed,
          resolvedProjects,
          settings.timezone,
          existingSession,
          startByteOffset > 0,
          {
            lastCompleteRecordByteOffset: completeByteOffset,
            fileSize: snapshot.fileSize,
            fileMtime: snapshot.fileMtime,
          },
        );
        context.log(`Ingested ${filePath}`);
        context.progress({
          filesTotal: filePaths.length,
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
  source: SourceSnapshot,
  renameArchivedFile: ArchivedFileRename,
): Promise<void> {
  const destination = rawArchiveDestination(archiveRoot, source.filePath);
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

function rawArchiveDestination(archiveRoot: string, sourcePath: string) {
  const absoluteSource = resolve(sourcePath);
  const filesystemRoot = parse(absoluteSource).root;
  return join(
    archiveRoot,
    'pi',
    Buffer.from(filesystemRoot).toString('base64url'),
    relative(filesystemRoot, absoluteSource),
  );
}

async function discoverSessionFiles(logSources: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const logSource of logSources) {
    let projectDirectories;
    try {
      projectDirectories = await readdir(logSource, { withFileTypes: true });
    } catch (cause) {
      if (isMissingPath(cause)) continue;
      throw cause;
    }
    for (const projectDirectory of projectDirectories) {
      if (!projectDirectory.isDirectory()) continue;
      const directoryPath = join(logSource, projectDirectory.name);
      const entries = await readdir(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          paths.push(join(directoryPath, entry.name));
        }
      }
    }
  }
  return paths.sort();
}

function isMissingPath(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === 'ENOENT'
  );
}

function storeSession(
  database: Database,
  stableSessionId: string,
  logFilePath: string,
  parsed: NormalisedPiSession,
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
    const cwds = new Set([
      parsed.cwd,
      ...parsed.interactions.map((interaction) => interaction.cwd),
    ]);
    for (const cwd of cwds) {
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
    const sessionProjectId = projectIds.get(parsed.cwd);
    if (sessionProjectId === undefined) {
      throw new Error(`Session Project was not stored: ${parsed.cwd}`);
    }

    const startedAt = resumingPrimary
      ? minimumTimestamp(existingSession?.startedAt ?? null, parsed.startedAt)
      : parsed.startedAt;
    const endedAt = resumingPrimary
      ? maximumTimestamp(existingSession?.endedAt ?? null, parsed.endedAt)
      : parsed.endedAt;
    transaction
      .insert(sessions)
      .values({
        harness: 'pi',
        stableSessionId,
        projectId: sessionProjectId,
        logFilePath,
        startedAt,
        endedAt,
      })
      .onConflictDoUpdate({
        target: [sessions.harness, sessions.stableSessionId],
        set: { projectId: sessionProjectId, logFilePath, startedAt, endedAt },
      })
      .run();
    const session = transaction
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.harness, 'pi'),
          eq(sessions.stableSessionId, stableSessionId),
        ),
      )
      .get();
    if (!session)
      throw new Error(`pi Session was not stored: ${stableSessionId}`);
    if (!resumingPrimary) {
      transaction
        .delete(interactions)
        .where(eq(interactions.sessionId, session.id))
        .run();
    }

    for (const interaction of parsed.interactions) {
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
          harness: 'pi',
          ...derived,
        })
        .onConflictDoUpdate({
          target: [interactions.sessionId, interactions.interactionKey],
          set: derived,
        })
        .run();
    }

    transaction
      .insert(checkpoints)
      .values({ harness: 'pi', stableSessionId, ...checkpoint })
      .onConflictDoUpdate({
        target: [checkpoints.harness, checkpoints.stableSessionId],
        set: checkpoint,
      })
      .run();
  });
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
