import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../database/connection';
import { updateSettings } from '../database/store';

const temporaryDirectories: string[] = [];

export async function createCodexIngestFixture() {
  const root = await mkdtemp(join(tmpdir(), 'llm-retro-codex-ingest-'));
  temporaryDirectories.push(root);
  const dataDirectory = join(root, 'data');
  const logSource = join(root, 'codex-sessions');
  const sessionDirectory = join(logSource, '2025', '01', '02');
  await mkdir(sessionDirectory, { recursive: true });
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  updateSettings(connection.database, {
    timezone: 'Asia/Kolkata',
    logSourceOverrides: { codex: [logSource] },
  });
  return { ...connection, logSource, sessionDirectory };
}

export async function writeCodexJsonLines(path: string, records: unknown[]) {
  await writeFile(
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
