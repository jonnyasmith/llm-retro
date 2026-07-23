import Sqlite from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('nullable Session Project migration', () => {
  it('preserves homogeneous Session data and foreign keys while allowing heterogeneous Sessions', async () => {
    const sqlite = new Sqlite(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE project (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        root_path text NOT NULL UNIQUE
      );
      CREATE TABLE session (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        harness text NOT NULL,
        stable_session_id text NOT NULL,
        project_id integer NOT NULL REFERENCES project(id),
        log_file_path text NOT NULL,
        started_at integer,
        ended_at integer
      );
      CREATE UNIQUE INDEX session_harness_stable_session_id_unique
        ON session (harness, stable_session_id);
      CREATE TABLE interaction (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        session_id integer NOT NULL REFERENCES session(id),
        project_id integer NOT NULL REFERENCES project(id)
      );
      INSERT INTO project (root_path) VALUES ('/work/homogeneous');
      INSERT INTO session (
        harness,
        stable_session_id,
        project_id,
        log_file_path,
        started_at,
        ended_at
      ) VALUES ('claude', 'existing-session', 1, '/logs/existing.jsonl', 10, 20);
      INSERT INTO interaction (session_id, project_id) VALUES (1, 1);
    `);

    try {
      const migration = await readFile(
        'drizzle/0004_nullable-session-project.sql',
        'utf8',
      );
      sqlite.pragma('foreign_keys = OFF');
      sqlite.transaction(() => {
        for (const statement of migration.split('--> statement-breakpoint')) {
          if (statement.trim().length > 0) sqlite.exec(statement);
        }
      })();
      sqlite.pragma('foreign_keys = ON');

      expect(
        sqlite.prepare('SELECT * FROM session WHERE id = 1').get(),
      ).toEqual({
        id: 1,
        harness: 'claude',
        stable_session_id: 'existing-session',
        project_id: 1,
        log_file_path: '/logs/existing.jsonl',
        started_at: 10,
        ended_at: 20,
      });
      expect(sqlite.prepare("PRAGMA table_info('session')").all()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'project_id', notnull: 0 }),
        ]),
      );
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);

      sqlite
        .prepare(
          `INSERT INTO session (
            harness,
            stable_session_id,
            project_id,
            log_file_path
          ) VALUES ('codex', 'heterogeneous-session', NULL, '/logs/codex.jsonl')`,
        )
        .run();
      const insertInvalidSession = sqlite.prepare(
        `INSERT INTO session (
          harness,
          stable_session_id,
          project_id,
          log_file_path
        ) VALUES ('codex', 'invalid-session', 999, '/logs/invalid.jsonl')`,
      );
      expect(() => insertInvalidSession.run()).toThrow(
        /FOREIGN KEY constraint failed/,
      );
    } finally {
      sqlite.close();
    }
  });
});
