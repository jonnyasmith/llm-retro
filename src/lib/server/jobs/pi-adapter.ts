import { piGrammar, type PiSessionMetadata } from './pi-log-reader';
import type { IngestAdapter } from './ingest-pipeline';
import { discoverProjectScopedSessionFiles } from './source-files';

export const piIngestAdapter: IngestAdapter<PiSessionMetadata> = {
  harness: 'pi',
  enumerateSourceFileGroups: enumeratePiSourceFileGroups,
  identifySession(primaryFilePath, primaryContents) {
    const metadata = piGrammar.readSessionMetadata(
      primaryFilePath,
      primaryContents,
    );
    return { stableSessionId: metadata.stableSessionId, metadata };
  },
  findResumeBoundary(primaryContents, beforeByteOffset, metadata) {
    return {
      byteOffset: piGrammar.findPromptBoundary(
        primaryContents,
        beforeByteOffset,
      ),
      metadata,
    };
  },
  parseSessionSlice({
    primaryFilePath,
    primaryContents,
    auxiliaryFiles,
    metadata,
  }) {
    return piGrammar.readSession(
      primaryFilePath,
      primaryContents,
      auxiliaryFiles,
      metadata,
    );
  },
  readSubTokenUpdates: () => [],
};

async function enumeratePiSourceFileGroups(logSources: string[]) {
  return (await discoverProjectScopedSessionFiles(logSources)).map(
    (primaryFilePath) => ({ primaryFilePath, auxiliaryFilePaths: [] }),
  );
}
