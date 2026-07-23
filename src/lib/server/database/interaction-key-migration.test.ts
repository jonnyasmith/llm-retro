import Sqlite from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('interaction key migration', () => {
  it('preserves existing Claude Interactions while generalising the key and adding the pi disclosure flag', async () => {
    const sqlite = new Sqlite(':memory:');
    sqlite.exec(`
      CREATE TABLE interaction (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        session_id integer NOT NULL,
        opening_user_record_id text NOT NULL,
        harness text NOT NULL
      );
      CREATE UNIQUE INDEX interaction_session_id_opening_user_record_id_unique
        ON interaction (session_id, opening_user_record_id);
      INSERT INTO interaction (session_id, opening_user_record_id, harness)
        VALUES (7, 'claude-prompt-1', 'claude');
    `);

    try {
      const migration = await readFile(
        'drizzle/0003_interaction-key-and-pi-subagents.sql',
        'utf8',
      );
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim().length > 0) sqlite.exec(statement);
      }

      expect(
        sqlite
          .prepare(
            'SELECT session_id, interaction_key, harness, spawned_subagents FROM interaction',
          )
          .get(),
      ).toEqual({
        session_id: 7,
        interaction_key: 'claude-prompt-1',
        harness: 'claude',
        spawned_subagents: 0,
      });
      expect(
        sqlite
          .prepare(
            "PRAGMA index_info('interaction_session_id_interaction_key_unique')",
          )
          .all(),
      ).toEqual([
        expect.objectContaining({ name: 'session_id' }),
        expect.objectContaining({ name: 'interaction_key' }),
      ]);
    } finally {
      sqlite.close();
    }
  });
});
