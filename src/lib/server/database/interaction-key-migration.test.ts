import Sqlite, { type Database as SqliteDriver } from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('interaction key migration', () => {
  describe('a Store migrated to a generalised Interaction key', () => {
    let sqlite!: SqliteDriver;

    beforeEach(async () => {
      sqlite = new Sqlite(':memory:');
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

      const migration = await readFile(
        'drizzle/0003_interaction-key-and-pi-subagents.sql',
        'utf8',
      );
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim().length > 0) sqlite.exec(statement);
      }
    });

    afterEach(() => {
      sqlite.close();
    });

    it('carries the existing Claude Interaction across unchanged', () => {
      expect(
        sqlite.prepare('SELECT id, session_id, harness FROM interaction').get(),
      ).toEqual({ id: 1, session_id: 7, harness: 'claude' });
    });

    it('adopts the opening user record id as the Interaction key', () => {
      expect(
        sqlite.prepare('SELECT interaction_key FROM interaction').get(),
      ).toEqual({ interaction_key: 'claude-prompt-1' });
    });

    it('discloses an existing Interaction as having spawned no sub-agents', () => {
      expect(
        sqlite.prepare('SELECT spawned_subagents FROM interaction').get(),
      ).toEqual({ spawned_subagents: 0 });
    });

    it('keys Interaction uniqueness on the Session and the Interaction key', () => {
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
    });

    it('retires the index keyed on the opening user record id', () => {
      expect(
        sqlite.prepare("PRAGMA index_list('interaction')").all(),
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'interaction_session_id_opening_user_record_id_unique',
          }),
        ]),
      );
    });

    it('rejects a second Interaction with the same Session and Interaction key', () => {
      const insertDuplicateInteraction = sqlite.prepare(
        `INSERT INTO interaction (session_id, interaction_key, harness)
          VALUES (7, 'claude-prompt-1', 'claude')`,
      );

      expect(() => insertDuplicateInteraction.run()).toThrow(
        /UNIQUE constraint failed/,
      );
    });

    it('defaults a new Interaction to having spawned no sub-agents', () => {
      sqlite
        .prepare(
          `INSERT INTO interaction (session_id, interaction_key, harness)
            VALUES (8, 'pi-prompt-1', 'pi')`,
        )
        .run();

      expect(
        sqlite
          .prepare(
            'SELECT spawned_subagents FROM interaction WHERE session_id = 8',
          )
          .get(),
      ).toEqual({ spawned_subagents: 0 });
    });

    it('rejects an Interaction whose sub-agent disclosure is unknown', () => {
      const insertUndisclosedInteraction = sqlite.prepare(
        `INSERT INTO interaction (session_id, interaction_key, harness, spawned_subagents)
          VALUES (9, 'pi-prompt-2', 'pi', NULL)`,
      );

      expect(() => insertUndisclosedInteraction.run()).toThrow(
        /NOT NULL constraint failed/,
      );
    });
  });
});
