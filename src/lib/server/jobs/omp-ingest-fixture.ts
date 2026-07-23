import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../database/connection';
import { updateSettings } from '../database/store';

const temporaryDirectories: string[] = [];

export async function createOmpIngestFixture() {
  const root = await mkdtemp(join(tmpdir(), 'llm-retro-omp-ingest-'));
  temporaryDirectories.push(root);
  const dataDirectory = join(root, 'data');
  const logSource = join(root, 'omp-sessions');
  const projectDirectory = join(logSource, '-work-alpha-');
  await mkdir(projectDirectory, { recursive: true });
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  updateSettings(connection.database, {
    timezone: 'Asia/Kolkata',
    logSourceOverrides: { omp: [logSource] },
  });
  return { ...connection, logSource, projectDirectory };
}

export async function writeOmpJsonLines(path: string, records: unknown[]) {
  await writeFile(
    path,
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
}

export async function cleanupOmpIngestFixtures() {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
