import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  findClaudePromptBoundary,
  readClaudeSession,
  readClaudeSubTokenUpdates,
  type NormalisedClaudeSession,
} from './claude-log-reader';
import type {
  IngestAdapter,
  NormalisedSession,
  ParseSessionSliceInput,
  SubTokenUpdateInput,
} from './ingest-pipeline';
import { isMissingPath } from './missing-path';
import { discoverProjectScopedSessionFiles } from './source-files';

export const claudeIngestAdapter: IngestAdapter<null> = {
  harness: 'claude',
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
  const primaryFilePaths = await discoverProjectScopedSessionFiles(logSources);
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
