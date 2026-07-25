import {
  findPiPromptBoundary,
  readPiSession,
  readPiSessionMetadata,
  type PiSessionMetadata,
} from './pi-log-reader';
import type { IngestAdapter, ParseSessionSliceInput } from './ingest-pipeline';
import { discoverProjectScopedSessionFiles } from './source-files';

export const piIngestAdapter: IngestAdapter<PiSessionMetadata> = {
  harness: 'pi',
  enumerateSourceFileGroups: enumeratePiSourceFileGroups,
  identifySession(primaryFilePath, primaryContents) {
    const metadata = readPiSessionMetadata(primaryFilePath, primaryContents);
    return { stableSessionId: metadata.stableSessionId, metadata };
  },
  findResumeBoundary(primaryContents, beforeByteOffset, metadata) {
    return {
      byteOffset: findPiPromptBoundary(primaryContents, beforeByteOffset),
      metadata,
    };
  },
  parseSessionSlice: parsePiSessionSlice,
  readSubTokenUpdates: () => [],
};

async function enumeratePiSourceFileGroups(logSources: string[]) {
  return (await discoverProjectScopedSessionFiles(logSources)).map(
    (primaryFilePath) => ({ primaryFilePath, auxiliaryFilePaths: [] }),
  );
}

function parsePiSessionSlice({
  primaryFilePath,
  primaryContents,
  metadata,
}: ParseSessionSliceInput<PiSessionMetadata>) {
  const parsed = readPiSession(primaryFilePath, primaryContents, metadata);
  return {
    startedAt: parsed.startedAt,
    endedAt: parsed.endedAt,
    interactions: parsed.interactions,
  };
}
