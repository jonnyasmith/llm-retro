import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  findCodexResumeBoundary,
  readCodexSession,
  readCodexSessionMetadata,
  type CodexSessionMetadata,
} from './codex-log-reader';
import type { IngestAdapter } from './ingest-pipeline';
import { isMissingPath } from './missing-path';

export const codexIngestAdapter: IngestAdapter<CodexSessionMetadata> = {
  harness: 'codex',
  enumerateSourceFileGroups: enumerateCodexSourceFileGroups,
  identifySession(primaryFilePath, primaryContents) {
    const metadata = readCodexSessionMetadata(primaryFilePath, primaryContents);
    return { stableSessionId: metadata.stableSessionId, metadata };
  },
  findResumeBoundary(primaryContents, beforeByteOffset, metadata) {
    const boundary = findCodexResumeBoundary(primaryContents, beforeByteOffset);
    return {
      byteOffset: boundary.byteOffset,
      metadata: {
        ...metadata,
        previousTotalTokenUsage: boundary.previousTotalTokenUsage,
      },
    };
  },
  parseSessionSlice({ primaryFilePath, primaryContents, metadata }) {
    return readCodexSession(primaryFilePath, primaryContents, metadata);
  },
  readSubTokenUpdates: () => [],
};

async function enumerateCodexSourceFileGroups(logSources: string[]) {
  const filePathsByName = new Map<string, string>();
  for (const primaryFilePath of await discoverSessionFiles(logSources)) {
    filePathsByName.set(basename(primaryFilePath), primaryFilePath);
  }
  return [...filePathsByName.values()].sort().map((primaryFilePath) => ({
    primaryFilePath,
    auxiliaryFilePaths: [],
  }));
}

async function discoverSessionFiles(logSources: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const logSource of logSources) {
    let entries;
    try {
      entries = await readdir(logSource, { withFileTypes: true });
    } catch (cause) {
      if (isMissingPath(cause)) continue;
      throw cause;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        paths.push(join(logSource, entry.name));
        continue;
      }
      if (!entry.isDirectory()) continue;
      const yearPath = join(logSource, entry.name);
      for (const month of await readdir(yearPath, { withFileTypes: true })) {
        if (!month.isDirectory()) continue;
        const monthPath = join(yearPath, month.name);
        for (const day of await readdir(monthPath, { withFileTypes: true })) {
          if (!day.isDirectory()) continue;
          const dayPath = join(monthPath, day.name);
          for (const entry of await readdir(dayPath, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.jsonl')) {
              paths.push(join(dayPath, entry.name));
            }
          }
        }
      }
    }
  }
  return paths.sort();
}
