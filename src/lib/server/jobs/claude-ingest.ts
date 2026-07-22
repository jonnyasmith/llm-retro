import { open, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
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
  claudeSessionHasSubagentFiles,
  findClaudeInteractionContextByteOffset,
  readClaudeSession,
  readClaudeSubTokenUpdates,
  type ClaudeSubTokenUpdate,
  type NormalisedClaudeSession,
} from './claude-adapter';
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

export function createClaudeIngestJob(): Job<null> {
  return {
    identity: { type: 'ingest', scope: 'claude' },
    payload: null,
  };
}

export function createClaudeIngestHandler(
  options: { resolveProject?: CwdProjectResolver } = {},
): JobHandler<null> {
  const resolveProject = options.resolveProject ?? resolveGitProject;

  return {
    async run(_payload, context) {
      const settings = getSettings(context.database);
      const filePaths = await discoverSessionFiles(settings.logSources.claude);
      const resolvedProjects = new Map<string, ResolvedProject>();
      context.progress({ filesTotal: filePaths.length, filesDone: 0 });

      for (const [index, filePath] of filePaths.entries()) {
        context.progress({
          filesTotal: filePaths.length,
          filesDone: index,
          currentFile: filePath,
        });
        const stableSessionId = basename(filePath, '.jsonl');
        const snapshot = await readStablePrimaryFile(filePath);
        const completeByteOffset = snapshot.contents.lastIndexOf(10) + 1;
        const storedCheckpoint = context.database
          .select()
          .from(checkpoints)
          .where(
            and(
              eq(checkpoints.harness, 'claude'),
              eq(checkpoints.stableSessionId, stableSessionId),
            ),
          )
          .get();
        const existingSession = context.database
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.harness, 'claude'),
              eq(sessions.stableSessionId, stableSessionId),
            ),
          )
          .get();
        const metadataMatches =
          storedCheckpoint?.fileSize === snapshot.fileSize &&
          storedCheckpoint.fileMtime === snapshot.fileMtime;
        const hasSubagentFiles = await claudeSessionHasSubagentFiles(filePath);
        if (metadataMatches && !hasSubagentFiles) {
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
        const startByteOffset = metadataMatches
          ? completeByteOffset
          : canResumeGrowth
            ? storedCheckpoint.lastCompleteRecordByteOffset
            : 0;
        const primaryContents = snapshot.contents
          .subarray(startByteOffset, completeByteOffset)
          .toString('utf8');
        let parsed =
          primaryContents.length > 0
            ? await readClaudeSession(filePath, primaryContents)
            : null;
        if (
          parsed?.requiresInteractionContext === true &&
          startByteOffset > 0
        ) {
          const contextByteOffset = findClaudeInteractionContextByteOffset(
            snapshot.contents,
            startByteOffset,
          );
          parsed = await readClaudeSession(
            filePath,
            snapshot.contents
              .subarray(contextByteOffset, completeByteOffset)
              .toString('utf8'),
          );
        }
        const subTokenUpdates = hasSubagentFiles
          ? await readClaudeSubTokenUpdates(
              filePath,
              snapshot.contents
                .subarray(0, completeByteOffset)
                .toString('utf8'),
            )
          : [];
        const cwds = new Set(
          parsed?.interactions.map((interaction) => interaction.cwd) ?? [],
        );
        if ((!existingSession || startByteOffset === 0) && parsed?.cwd) {
          cwds.add(parsed.cwd);
        }
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
          subTokenUpdates,
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
        context.progress({
          filesTotal: filePaths.length,
          filesDone: index + 1,
        });
      }
    },
  };
}

async function readStablePrimaryFile(filePath: string) {
  const fileHandle = await open(filePath, 'r');
  try {
    const before = await fileHandle.stat();
    const contents = await fileHandle.readFile();
    const after = await fileHandle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`File changed while it was being read: ${filePath}`);
    }
    return {
      contents,
      fileSize: after.size,
      fileMtime: Math.trunc(after.mtimeMs),
    };
  } finally {
    await fileHandle.close();
  }
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
  parsed: NormalisedClaudeSession | null,
  subTokenUpdates: ClaudeSubTokenUpdate[],
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
      parsed?.interactions.map((interaction) => interaction.cwd) ?? [],
    );
    if ((!existingSession || !resumingPrimary) && parsed?.cwd) {
      sessionCwds.add(parsed.cwd);
    }
    for (const cwd of sessionCwds) {
      const resolved = resolvedProjects.get(cwd);
      if (!resolved)
        throw new Error(`Project was not resolved for cwd: ${cwd}`);
      transaction
        .insert(projects)
        .values(resolved)
        .onConflictDoUpdate({
          target: projects.rootPath,
          set: { gitRemoteUrl: resolved.gitRemoteUrl },
        })
        .run();
      const project = transaction
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.rootPath, resolved.rootPath))
        .get();
      if (!project)
        throw new Error(`Project was not stored: ${resolved.rootPath}`);
      projectIds.set(cwd, project.id);
    }

    if (parsed) {
      const sessionProjectId =
        resumingPrimary && existingSession
          ? existingSession.projectId
          : parsed.cwd === null
            ? undefined
            : projectIds.get(parsed.cwd);
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
          harness: 'claude',
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
    }
    const session = transaction
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.harness, 'claude'),
          eq(sessions.stableSessionId, stableSessionId),
        ),
      )
      .get();
    if (!session && (parsed || subTokenUpdates.length > 0)) {
      throw new Error(`Claude Session was not stored: ${stableSessionId}`);
    }
    if (session && !resumingPrimary) {
      transaction
        .delete(interactions)
        .where(eq(interactions.sessionId, session.id))
        .run();
    }

    for (const interaction of parsed?.interactions ?? []) {
      if (!session) {
        throw new Error(`Claude Session was not stored: ${stableSessionId}`);
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
        timestamp: interaction.timestamp,
        ...deriveLocalBuckets(interaction.timestamp, timezone),
      };
      transaction
        .insert(interactions)
        .values({
          sessionId: session.id,
          openingUserRecordId: interaction.openingUserRecordId,
          harness: 'claude',
          ...derived,
        })
        .onConflictDoUpdate({
          target: [interactions.sessionId, interactions.openingUserRecordId],
          set: derived,
        })
        .run();
    }

    if (session) {
      for (const update of subTokenUpdates) {
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
              eq(interactions.openingUserRecordId, update.openingUserRecordId),
            ),
          )
          .run();
      }
    }

    transaction
      .insert(checkpoints)
      .values({ harness: 'claude', stableSessionId, ...checkpoint })
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
