import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/connection';
import { interactions, projects, sessions } from '../database/schema';
import { getSettings } from '../database/store';
import { deriveLocalBuckets } from '../database/time-buckets';
import {
  readClaudeSession,
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
        const parsed = await readClaudeSession(filePath);
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
          basename(filePath, '.jsonl'),
          filePath,
          parsed,
          resolvedProjects,
          settings.timezone,
        );
        context.progress({
          filesTotal: filePaths.length,
          filesDone: index + 1,
        });
      }
    },
  };
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
  parsed: NormalisedClaudeSession,
  resolvedProjects: Map<string, ResolvedProject>,
  timezone: string,
): void {
  database.transaction((transaction) => {
    const projectIds = new Map<string, number>();
    for (const cwd of new Set([
      parsed.cwd,
      ...parsed.interactions.map((interaction) => interaction.cwd),
    ])) {
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

    const sessionProjectId = projectIds.get(parsed.cwd);
    if (sessionProjectId === undefined) {
      throw new Error(`Session Project was not stored: ${parsed.cwd}`);
    }
    transaction
      .insert(sessions)
      .values({
        harness: 'claude',
        stableSessionId,
        projectId: sessionProjectId,
        logFilePath,
        startedAt: parsed.startedAt,
        endedAt: parsed.endedAt,
      })
      .onConflictDoUpdate({
        target: [sessions.harness, sessions.stableSessionId],
        set: {
          projectId: sessionProjectId,
          logFilePath,
          startedAt: parsed.startedAt,
          endedAt: parsed.endedAt,
        },
      })
      .run();
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
    if (!session)
      throw new Error(`Claude Session was not stored: ${stableSessionId}`);

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
  });
}
