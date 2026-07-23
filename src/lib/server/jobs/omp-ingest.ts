import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  findOmpInteractionContextByteOffset,
  readOmpSession,
  readOmpSessionMetadata,
  readOmpSubTokenUpdates,
  type OmpSessionMetadata,
} from './omp-adapter';
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

export function createOmpIngestJob(): Job<null> {
  return {
    identity: { type: 'ingest', scope: 'omp' },
    payload: null,
  };
}

export function createOmpIngestHandler(
  options: {
    resolveProject?: CwdProjectResolver;
    renameArchivedFile?: ArchivedFileRename;
  } = {},
): JobHandler<null> {
  return createIngestHandler(ompIngestAdapter, options);
}

const ompIngestAdapter: IngestAdapter<OmpSessionMetadata> = {
  harness: 'omp',
  displayName: 'omp',
  enumerateSourceFileGroups: enumerateOmpSourceFileGroups,
  identifySession(primaryFilePath, primaryContents) {
    const metadata = readOmpSessionMetadata(primaryFilePath, primaryContents);
    return { stableSessionId: metadata.stableSessionId, metadata };
  },
  parseSessionSlice: parseOmpSessionSlice,
};

async function enumerateOmpSourceFileGroups(logSources: string[]) {
  const primaryFilePaths = await discoverSessionFiles(logSources);
  return Promise.all(
    primaryFilePaths.map(async (primaryFilePath) => ({
      primaryFilePath,
      auxiliaryFilePaths: await discoverNestedAgentFiles(primaryFilePath),
    })),
  );
}

function parseOmpSessionSlice({
  primaryFilePath,
  primaryContents,
  completePrimaryContents,
  completeByteOffset,
  startByteOffset,
  auxiliaryFiles,
  metadata,
}: ParseSessionSliceInput<OmpSessionMetadata>) {
  let parsed =
    primaryContents.length > 0
      ? readOmpSession(
          primaryFilePath,
          primaryContents,
          auxiliaryFiles,
          metadata,
        )
      : null;
  if (parsed?.requiresInteractionContext === true && startByteOffset > 0) {
    const contextByteOffset = findOmpInteractionContextByteOffset(
      completePrimaryContents,
      startByteOffset,
    );
    parsed = readOmpSession(
      primaryFilePath,
      completePrimaryContents
        .subarray(contextByteOffset, completeByteOffset)
        .toString('utf8'),
      auxiliaryFiles,
      metadata,
    );
  }

  return {
    session:
      parsed === null
        ? null
        : {
            startedAt: parsed.startedAt,
            endedAt: parsed.endedAt,
            interactions: parsed.interactions,
          },
    interactionUpdates:
      auxiliaryFiles.length === 0
        ? []
        : readOmpSubTokenUpdates(
            primaryFilePath,
            completePrimaryContents
              .subarray(0, completeByteOffset)
              .toString('utf8'),
            auxiliaryFiles,
            metadata,
          ),
  };
}

async function discoverNestedAgentFiles(primaryFilePath: string) {
  const sessionDirectory = join(
    dirname(primaryFilePath),
    basename(primaryFilePath, '.jsonl'),
  );
  const paths: string[] = [];

  const visit = async (directoryPath: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (cause) {
      if (isMissingPath(cause)) return;
      throw cause;
    }
    for (const entry of entries) {
      const path = join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        paths.push(path);
      }
    }
  };

  await visit(sessionDirectory);
  return paths.sort();
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
