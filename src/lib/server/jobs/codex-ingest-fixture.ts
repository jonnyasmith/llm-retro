import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../database/connection';
import { updateSettings } from '../database/store';

const temporaryDirectories: string[] = [];

export async function createCodexIngestFixture() {
  const root = await mkdtemp(join(tmpdir(), 'llm-retro-codex-ingest-'));
  temporaryDirectories.push(root);
  const dataDirectory = join(root, 'data');
  const sessionsRoot = join(root, 'codex');
  const logSource = join(sessionsRoot, 'sessions');
  const archivedSessionDirectory = join(sessionsRoot, 'archived_sessions');
  const sessionDirectory = join(logSource, '2025', '01', '02');
  await Promise.all([
    mkdir(sessionDirectory, { recursive: true }),
    mkdir(archivedSessionDirectory, { recursive: true }),
  ]);
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  updateSettings(connection.database, {
    timezone: 'Asia/Kolkata',
    logSourceOverrides: {
      codex: [logSource, archivedSessionDirectory],
    },
  });
  return {
    ...connection,
    logSource,
    archivedSessionDirectory,
    sessionDirectory,
  };
}

export async function writeCodexJsonLines(path: string, records: unknown[]) {
  await writeFile(
    path,
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
}

export async function appendCodexJsonLines(path: string, records: unknown[]) {
  await appendFile(
    path,
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
}

export async function cleanupCodexIngestFixtures() {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
