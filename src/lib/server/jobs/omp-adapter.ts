import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  findOmpPromptBoundary,
  readOmpSession,
  readOmpSessionMetadata,
  readOmpSubTokenUpdates,
  type OmpSessionMetadata,
} from './omp-log-reader';
import type {
  IngestAdapter,
  ParseSessionSliceInput,
  SubTokenUpdateInput,
} from './ingest-pipeline';
import { isMissingPath } from './missing-path';
import { discoverProjectScopedSessionFiles } from './source-files';

export const ompIngestAdapter: IngestAdapter<OmpSessionMetadata> = {
  harness: 'omp',
  enumerateSourceFileGroups: enumerateOmpSourceFileGroups,
  identifySession(primaryFilePath, primaryContents) {
    const metadata = readOmpSessionMetadata(primaryFilePath, primaryContents);
    return { stableSessionId: metadata.stableSessionId, metadata };
  },
  findResumeBoundary(primaryContents, beforeByteOffset, metadata) {
    return {
      byteOffset: findOmpPromptBoundary(primaryContents, beforeByteOffset),
      metadata,
    };
  },
  parseSessionSlice: parseOmpSessionSlice,
  readSubTokenUpdates: readOmpSliceSubTokenUpdates,
};

async function enumerateOmpSourceFileGroups(logSources: string[]) {
  const primaryFilePaths = await discoverProjectScopedSessionFiles(logSources);
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
  auxiliaryFiles,
  metadata,
}: ParseSessionSliceInput<OmpSessionMetadata>) {
  if (primaryContents.length === 0) return null;
  const parsed = readOmpSession(
    primaryFilePath,
    primaryContents,
    auxiliaryFiles,
    metadata,
  );
  return {
    startedAt: parsed.startedAt,
    endedAt: parsed.endedAt,
    interactions: parsed.interactions,
  };
}

function readOmpSliceSubTokenUpdates({
  primaryFilePath,
  completePrimaryContents,
  auxiliaryFiles,
  metadata,
}: SubTokenUpdateInput<OmpSessionMetadata>) {
  if (auxiliaryFiles.length === 0) return [];
  return readOmpSubTokenUpdates(
    primaryFilePath,
    completePrimaryContents,
    auxiliaryFiles,
    metadata,
  );
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
