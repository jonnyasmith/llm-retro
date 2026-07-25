import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  findClaudePromptBoundary,
  readClaudeSession,
  readClaudeSubTokenUpdates,
  type NormalisedClaudeSession,
} from './claude-adapter';
import {
  createIngestHandler,
  type IngestAdapter,
  type NormalisedSession,
  type ParseSessionSliceInput,
  type SubTokenUpdateInput,
} from './ingest-pipeline';
import type { CwdProjectResolver } from './project-resolver';
import type { Job, JobHandler } from './types';

export {
  literalCwdProjectResolver,
  resolveGitProject,
  type CwdProjectResolver,
  type ResolvedProject,
} from './project-resolver';

type ArchivedFileRename = (oldPath: string, newPath: string) => Promise<void>;

export function createClaudeIngestJob(): Job<null> {
  return {
    identity: { type: 'ingest', scope: 'claude' },
    payload: null,
  };
}

export function createClaudeIngestHandler(
  options: {
    resolveProject?: CwdProjectResolver;
    renameArchivedFile?: ArchivedFileRename;
  } = {},
): JobHandler<null> {
  return createIngestHandler(claudeIngestAdapter, options);
}

const claudeIngestAdapter: IngestAdapter<null> = {
  harness: 'claude',
  displayName: 'Claude',
  enumerateSourceFileGroups: enumerateClaudeSourceFileGroups,
  identifySession(primaryFilePath) {
    return {
      stableSessionId: basename(primaryFilePath, '.jsonl'),
      metadata: null,
    };
  },
  findResumeBoundary(primaryContents, beforeByteOffset, metadata) {
    return {
      byteOffset: findClaudePromptBoundary(primaryContents, beforeByteOffset),
      metadata,
    };
  },
  parseSessionSlice: parseClaudeSessionSlice,
  readSubTokenUpdates: readClaudeSliceSubTokenUpdates,
};

async function enumerateClaudeSourceFileGroups(logSources: string[]) {
  const primaryFilePaths = await discoverSessionFiles(logSources);
  return Promise.all(
    primaryFilePaths.map(async (primaryFilePath) => ({
      primaryFilePath,
      auxiliaryFilePaths: await discoverSubagentFiles(primaryFilePath),
    })),
  );
}

function parseClaudeSessionSlice({
  primaryFilePath,
  primaryContents,
  auxiliaryFiles,
}: ParseSessionSliceInput<null>): NormalisedSession | null {
  if (primaryContents.length === 0) return null;
  return toNormalisedSession(
    readClaudeSession(primaryFilePath, primaryContents, auxiliaryFiles),
  );
}

function readClaudeSliceSubTokenUpdates({
  primaryFilePath,
  completePrimaryContents,
  auxiliaryFiles,
}: SubTokenUpdateInput<null>) {
  if (auxiliaryFiles.length === 0) return [];
  return readClaudeSubTokenUpdates(
    primaryFilePath,
    completePrimaryContents,
    auxiliaryFiles,
  );
}

function toNormalisedSession(
  session: NormalisedClaudeSession,
): NormalisedSession {
  return {
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    interactions: session.interactions.map((interaction) => ({
      ...interaction,
      spawnedSubagents: false,
    })),
  };
}

async function discoverSubagentFiles(sessionFilePath: string) {
  const directoryPath = join(
    dirname(sessionFilePath),
    basename(sessionFilePath, '.jsonl'),
    'subagents',
  );
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (cause) {
    if (isMissingPath(cause)) return [];
    throw cause;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => join(directoryPath, entry.name));
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
