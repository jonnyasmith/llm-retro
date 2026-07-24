import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../database/connection';
import { persistSettings } from '../database/store';

const temporaryDirectories: string[] = [];

export async function createClaudeIngestFixture() {
  const root = await mkdtemp(join(tmpdir(), 'llm-retro-claude-ingest-'));
  temporaryDirectories.push(root);
  const dataDirectory = join(root, 'data');
  const logSource = join(root, 'claude-projects');
  const projectDirectory = join(logSource, '-work-alpha');
  await mkdir(projectDirectory, { recursive: true });
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  persistSettings(connection.database, {
    timezone: 'Asia/Kolkata',
    logSourceOverrides: { claude: [logSource] },
  });
  return { ...connection, logSource, projectDirectory };
}

export async function writeJsonLines(path: string, records: unknown[]) {
  await writeFile(
    path,
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
}

export async function cleanupClaudeIngestFixtures() {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
