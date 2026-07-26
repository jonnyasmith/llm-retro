import Sqlite, {
  type Database as SqliteDriver,
  type RunResult,
} from 'better-sqlite3';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as schema from './schema';

const DATA_DIRECTORY_ENVIRONMENT_VARIABLE = 'LLM_RETRO_DATA_DIR';

/** The queryable Store. */
export type Database = BetterSQLite3Database<typeof schema>;

/** One transaction over the Store, as handed to a transaction body. */
export type DatabaseTransaction = SQLiteTransaction<
  'sync',
  RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** How the rest of the application reaches the Store (ADR-0013). */
export interface Connection {
  readonly database: Database;
  readonly databasePath: string;
  /**
   * The raw driver, for the callers that must issue SQL the Store does not
   * model — a pragma, a schema probe, a trigger. Any other reach for it is a
   * duty missing from this interface (ADR-0013).
   */
  readonly unsafeSqlite: SqliteDriver;
  /** No production caller, by design (ADR-0013). */
  close(): void;
  /** Throws unless a query still reaches the Store. */
  assertConnected(): void;
}

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

export function openDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): Connection {
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

  return {
    database,
    databasePath,
    unsafeSqlite: sqlite,
    close: () => sqlite.close(),
    assertConnected: () => {
      sqlite.prepare('select 1').get();
    },
  };
}
