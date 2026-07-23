import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { openDatabase } from '../database/connection';
import { updateSettings } from '../database/store';

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

export async function createClaudeIngestFixture() {
  const root = await mkdtemp(join(tmpdir(), 'llm-retro-claude-ingest-'));
  temporaryDirectories.push(root);
  const dataDirectory = join(root, 'data');
  const logSource = join(root, 'claude-projects');
  const projectDirectory = join(logSource, '-work-alpha');
  await mkdir(projectDirectory, { recursive: true });
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  updateSettings(connection.database, {
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

export async function initialiseGitProject(path: string, remote?: string) {
  await mkdir(path, { recursive: true });
  await execFileAsync('git', ['init', path]);
  await execFileAsync('git', [
    '-C',
    path,
    '-c',
    'user.name=LLM Retro Tests',
    '-c',
    'user.email=tests@llm-retro.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'Initial commit',
  ]);
  if (remote) {
    await execFileAsync('git', ['-C', path, 'remote', 'add', 'origin', remote]);
  }
}

export async function cleanupClaudeIngestFixtures() {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}
