import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  findPiInteractionContextByteOffset,
  readPiSession,
  readPiSessionMetadata,
  type PiSessionMetadata,
} from './pi-adapter';
import {
  createIngestHandler,
  type IngestAdapter,
  type ParseSessionSliceInput,
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
  return createIngestHandler(piIngestAdapter, options);
}

const piIngestAdapter: IngestAdapter<PiSessionMetadata> = {
  harness: 'pi',
  displayName: 'pi',
  enumerateSourceFileGroups: enumeratePiSourceFileGroups,
  identifySession(primaryFilePath, primaryContents) {
    const metadata = readPiSessionMetadata(primaryFilePath, primaryContents);
    return { stableSessionId: metadata.stableSessionId, metadata };
  },
  parseSessionSlice: parsePiSessionSlice,
};

async function enumeratePiSourceFileGroups(logSources: string[]) {
  return (await discoverSessionFiles(logSources)).map((primaryFilePath) => ({
    primaryFilePath,
    auxiliaryFilePaths: [],
  }));
}

function parsePiSessionSlice({
  primaryFilePath,
  primaryContents,
  completePrimaryContents,
  completeByteOffset,
  startByteOffset,
  metadata,
}: ParseSessionSliceInput<PiSessionMetadata>) {
  let parsed = readPiSession(primaryFilePath, primaryContents, metadata);
  if (parsed.requiresInteractionContext && startByteOffset > 0) {
    const contextByteOffset = findPiInteractionContextByteOffset(
      completePrimaryContents,
      startByteOffset,
    );
    parsed = readPiSession(
      primaryFilePath,
      completePrimaryContents
        .subarray(contextByteOffset, completeByteOffset)
        .toString('utf8'),
      metadata,
    );
  }
  return {
    session: {
      cwd: parsed.cwd,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      interactions: parsed.interactions,
    },
    interactionUpdates: [],
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
