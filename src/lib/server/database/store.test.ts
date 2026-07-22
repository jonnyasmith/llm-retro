import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection';
import {
  checkpoints,
  interactions,
  projects,
  sessions,
  settings,
} from './schema';
import {
  getSettings,
  insertInteraction,
  resolveDefaultLogSources,
  updateSettings,
} from './store';

const temporaryDirectories: string[] = [];

async function createDatabase() {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-store-'));
  temporaryDirectories.push(dataDirectory);
  return openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
}

async function createSessionFixture(
  database: ReturnType<typeof openDatabase>['database'],
) {
  const [project] = database
    .insert(projects)
    .values({ rootPath: '/work/llm-retro', gitRemoteUrl: 'git@example/repo' })
    .returning()
    .all();
  const [session] = database
    .insert(sessions)
    .values({
      harness: 'codex',
      stableSessionId: 'session-1',
      projectId: project.id,
      logFilePath: '/logs/session-1.jsonl',
    })
    .returning()
    .all();

  return { project, session };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('analytical store', () => {
  it('applies all domain migrations to a fresh SQLite database', async () => {
    const connection = await createDatabase();

    try {
      const tableNames = connection.sqlite
        .prepare("select name from sqlite_master where type = 'table'")
        .pluck()
        .all();

      expect(tableNames).toEqual(
        expect.arrayContaining([
          'project',
          'session',
          'interaction',
          'checkpoint',
          'settings',
        ]),
      );
    } finally {
      connection.sqlite.close();
    }
  });

  it('collapses a repeated Interaction identity through the public insertion seam', async () => {
    const connection = await createDatabase();

    try {
      const { project, session } = await createSessionFixture(
        connection.database,
      );
      const interaction = {
        sessionId: session.id,
        openingUserRecordId: 'record-1',
        harness: 'codex',
        projectId: project.id,
        model: 'gpt-5.1-codex-max',
        modelRaw: 'gpt-5.1-codex-max-2025-11-19',
        timestamp: Date.parse('2025-11-02T05:30:00.000Z'),
        localDow: 0,
        localHour: 1,
        localDate: '2025-11-02',
      } as const;

      const first = insertInteraction(connection.database, interaction);
      const duplicate = insertInteraction(connection.database, interaction);

      expect(duplicate).toEqual(first);
      expect(
        connection.database.select().from(interactions).all(),
      ).toHaveLength(1);
      expect(() =>
        connection.database.insert(interactions).values(interaction).run(),
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      connection.sqlite.close();
    }
  });

  it('enforces Project and Session identities independently of display attributes', async () => {
    const connection = await createDatabase();

    try {
      const [firstProject] = connection.database
        .insert(projects)
        .values({ rootPath: '/work/one', gitRemoteUrl: 'git@example/repo' })
        .returning()
        .all();
      connection.database
        .insert(projects)
        .values({ rootPath: '/work/two', gitRemoteUrl: 'git@example/repo' })
        .run();
      expect(() =>
        connection.database
          .insert(projects)
          .values({ rootPath: '/work/one', gitRemoteUrl: 'git@example/other' })
          .run(),
      ).toThrow(/UNIQUE constraint failed/);

      connection.database
        .insert(sessions)
        .values({
          harness: 'codex',
          stableSessionId: 'stable-id',
          projectId: firstProject.id,
          logFilePath: '/logs/original.jsonl',
        })
        .run();
      expect(() =>
        connection.database
          .insert(sessions)
          .values({
            harness: 'codex',
            stableSessionId: 'stable-id',
            projectId: firstProject.id,
            logFilePath: '/logs/moved.jsonl',
          })
          .run(),
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      connection.sqlite.close();
    }
  });

  it('round-trips absent token buckets distinctly from genuine zero', async () => {
    const connection = await createDatabase();

    try {
      const { project, session } = await createSessionFixture(
        connection.database,
      );
      const stored = insertInteraction(connection.database, {
        sessionId: session.id,
        openingUserRecordId: 'record-1',
        harness: 'codex',
        projectId: project.id,
        model: 'gpt-5.1-codex-max',
        modelRaw: 'gpt-5.1-codex-max',
        mainInputTokens: 0,
        mainOutputTokens: null,
        timestamp: 0,
        localDow: 4,
        localHour: 0,
        localDate: '1970-01-01',
      });

      expect(stored.mainInputTokens).toBe(0);
      expect(stored.mainOutputTokens).toBeNull();
      expect(stored.subInputTokens).toBeNull();
    } finally {
      connection.sqlite.close();
    }
  });

  it('stores the checkpoint identity and last-complete file state', async () => {
    const connection = await createDatabase();

    try {
      connection.database
        .insert(checkpoints)
        .values({
          harness: 'claude',
          stableSessionId: 'session-1',
          lastCompleteRecordByteOffset: 512,
          fileSize: 1024,
          fileMtime: 1_765_000_000_000,
        })
        .run();

      expect(
        connection.database.select().from(checkpoints).get(),
      ).toMatchObject({
        harness: 'claude',
        stableSessionId: 'session-1',
        lastCompleteRecordByteOffset: 512,
        fileSize: 1024,
      });
    } finally {
      connection.sqlite.close();
    }
  });

  it('applies OS-derived settings defaults until preferences are overridden', async () => {
    const connection = await createDatabase();

    try {
      expect(getSettings(connection.database, () => 'Europe/London')).toEqual({
        timezone: 'Europe/London',
        rawArchiveEnabled: false,
        rawArchivePath: null,
        logSources: resolveDefaultLogSources(),
      });
      expect(connection.database.select().from(settings).all()).toHaveLength(0);

      updateSettings(connection.database, {
        timezone: 'Asia/Kolkata',
        rawArchiveEnabled: true,
        rawArchivePath: '/archive',
        logSourceOverrides: { codex: ['/logs/codex'] },
      });

      expect(getSettings(connection.database)).toEqual({
        timezone: 'Asia/Kolkata',
        rawArchiveEnabled: true,
        rawArchivePath: '/archive',
        logSources: {
          ...resolveDefaultLogSources(),
          codex: ['/logs/codex'],
        },
      });

      updateSettings(connection.database, {
        rawArchiveEnabled: false,
        rawArchivePath: null,
      });
      expect(getSettings(connection.database)).toMatchObject({
        rawArchiveEnabled: false,
        rawArchivePath: null,
      });
    } finally {
      connection.sqlite.close();
    }
  });

  it('merges partial log-source overrides with conventional Harness paths', async () => {
    const connection = await createDatabase();

    try {
      updateSettings(connection.database, {
        logSourceOverrides: { claude: ['/external/claude'] },
      });

      expect(getSettings(connection.database).logSources).toEqual({
        ...resolveDefaultLogSources(),
        claude: ['/external/claude'],
      });
    } finally {
      connection.sqlite.close();
    }
  });

  it('rolls back bucket changes when the timezone setting cannot be stored', async () => {
    const connection = await createDatabase();

    try {
      updateSettings(connection.database, { timezone: 'Europe/London' });
      const { project, session } = await createSessionFixture(
        connection.database,
      );
      insertInteraction(connection.database, {
        sessionId: session.id,
        openingUserRecordId: 'record-1',
        harness: 'codex',
        projectId: project.id,
        model: 'gpt-5',
        modelRaw: 'gpt-5',
        timestamp: Date.parse('2025-01-01T20:00:00.000Z'),
        localDow: 3,
        localHour: 20,
        localDate: '2025-01-01',
      });
      connection.sqlite.exec(`
        create trigger reject_timezone_update
        before update on settings
        begin
          select raise(abort, 'settings update rejected');
        end;
      `);

      expect(() =>
        updateSettings(connection.database, { timezone: 'Asia/Kolkata' }),
      ).toThrow(/settings update rejected/);
      expect(getSettings(connection.database).timezone).toBe('Europe/London');
      expect(
        connection.database.select().from(interactions).get(),
      ).toMatchObject({
        localDow: 3,
        localHour: 20,
        localDate: '2025-01-01',
      });
    } finally {
      connection.sqlite.close();
    }
  });

  it('recomputes every local bucket from stored UTC when timezone changes', async () => {
    const connection = await createDatabase();

    try {
      const { project, session } = await createSessionFixture(
        connection.database,
      );
      insertInteraction(connection.database, {
        sessionId: session.id,
        openingUserRecordId: 'record-1',
        harness: 'codex',
        projectId: project.id,
        model: 'gpt-5',
        modelRaw: 'gpt-5',
        timestamp: Date.parse('2025-01-01T20:00:00.000Z'),
        localDow: 3,
        localHour: 20,
        localDate: '2025-01-01',
      });

      updateSettings(connection.database, { timezone: 'Asia/Kolkata' });
      expect(
        connection.database.select().from(interactions).get(),
      ).toMatchObject({
        timestamp: Date.parse('2025-01-01T20:00:00.000Z'),
        localDow: 4,
        localHour: 1,
        localDate: '2025-01-02',
      });
    } finally {
      connection.sqlite.close();
    }
  });
});
