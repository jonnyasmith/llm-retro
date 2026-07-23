import Sqlite from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as schema from './schema';

const DATA_DIRECTORY_ENVIRONMENT_VARIABLE = 'LLM_RETRO_DATA_DIR';

export function resolveDataDirectory(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const override = environment[DATA_DIRECTORY_ENVIRONMENT_VARIABLE];
  if (override) return resolve(override);

  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'llm-retro');
  }

  if (platform === 'win32') {
    return join(
      environment.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      'llm-retro',
    );
  }

  return join(
    environment.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
    'llm-retro',
  );
}

export function openDatabase(environment: NodeJS.ProcessEnv = process.env) {
  const dataDirectory = resolveDataDirectory(environment);
  mkdirSync(dataDirectory, { recursive: true });

  const databasePath = join(dataDirectory, 'llm-retro.sqlite3');
  const sqlite = new Sqlite(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = OFF');

  const database = drizzle(sqlite, { schema });
  migrate(database, { migrationsFolder: resolve('drizzle') });
  const foreignKeyViolations = sqlite.pragma('foreign_key_check');
  if (!Array.isArray(foreignKeyViolations) || foreignKeyViolations.length > 0) {
    throw new Error('Database migration left foreign key violations');
  }
  sqlite.pragma('foreign_keys = ON');

  return { database, databasePath, sqlite };
}

export type Database = ReturnType<typeof openDatabase>['database'];
