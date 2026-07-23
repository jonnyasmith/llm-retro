import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection';
import { interactions, jobRuns, projects, sessions, settings } from './schema';
import {
  getActivityHeatmap,
  getHarnessBreakdown,
  getModelBreakdown,
  getOverviewTotals,
  getProjectBreakdown,
  getSessionShape,
  getSettings,
  insertInteraction,
  listJobRuns,
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
  it('collapses a repeated Interaction identity through the public insertion seam', async () => {
    const connection = await createDatabase();

    try {
      const { project, session } = await createSessionFixture(
        connection.database,
      );
      const interaction = {
        sessionId: session.id,
        interactionKey: 'record-1',
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
        interactionKey: 'record-1',
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

  it('aggregates Interaction and complete main-plus-sub token totals', async () => {
    const connection = await createDatabase();

    try {
      const { project, session } = await createSessionFixture(
        connection.database,
      );
      const facts = [
        {
          interactionKey: 'record-1',
          mainInputTokens: 11,
          mainOutputTokens: 13,
          mainCacheReadTokens: 17,
          mainCacheWriteTokens: 19,
          subInputTokens: 23,
          subOutputTokens: 29,
          subCacheReadTokens: 31,
          subCacheWriteTokens: 37,
          localDow: 1,
          localHour: 9,
          localDate: '2025-01-06',
        },
        {
          interactionKey: 'record-2',
          mainInputTokens: null,
          mainOutputTokens: null,
          mainCacheReadTokens: 5,
          mainCacheWriteTokens: null,
          subInputTokens: null,
          subOutputTokens: 0,
          subCacheReadTokens: null,
          subCacheWriteTokens: 7,
          localDow: 1,
          localHour: 9,
          localDate: '2025-01-13',
        },
        {
          interactionKey: 'record-3',
          mainInputTokens: null,
          mainOutputTokens: null,
          mainCacheReadTokens: null,
          mainCacheWriteTokens: null,
          subInputTokens: null,
          subOutputTokens: null,
          subCacheReadTokens: null,
          subCacheWriteTokens: null,
          localDow: 6,
          localHour: 23,
          localDate: '2025-01-18',
        },
      ] as const;
      for (const [index, fact] of facts.entries()) {
        insertInteraction(connection.database, {
          sessionId: session.id,
          harness: 'codex',
          projectId: project.id,
          model: 'gpt-5.1-codex-max',
          modelRaw: 'gpt-5.1-codex-max',
          timestamp: index,
          ...fact,
        });
      }

      expect(getOverviewTotals(connection.database)).toEqual({
        interactionCount: 3,
        totalTokens: 192,
      });
      expect(getActivityHeatmap(connection.database)).toEqual([
        { localDow: 1, localHour: 9, interactionCount: 2 },
        { localDow: 6, localHour: 23, interactionCount: 1 },
      ]);
    } finally {
      connection.sqlite.close();
    }
  });

  it('returns explicit zero analytics for an empty Interaction store', async () => {
    const connection = await createDatabase();

    try {
      expect(getOverviewTotals(connection.database)).toEqual({
        interactionCount: 0,
        totalTokens: 0,
      });
      expect(getActivityHeatmap(connection.database)).toEqual([]);
    } finally {
      connection.sqlite.close();
    }
  });

  it('reads harness-scoped Job run history newest-first with timing', async () => {
    const connection = await createDatabase();

    try {
      connection.database
        .insert(jobRuns)
        .values([
          {
            type: 'ingest',
            scope: 'claude',
            correlationId: '11111111-1111-4111-8111-111111111111',
            status: 'succeeded',
            startedAt: 100,
            finishedAt: 150,
            filesTotal: 4,
            filesDone: 4,
          },
          {
            type: 'stub',
            scope: '',
            correlationId: '22222222-2222-4222-8222-222222222222',
            status: 'succeeded',
            startedAt: 200,
            finishedAt: 250,
          },
          {
            type: 'ingest',
            scope: 'claude',
            correlationId: '33333333-3333-4333-8333-333333333333',
            status: 'running',
            startedAt: 300,
            filesTotal: 8,
            filesDone: 3,
          },
        ])
        .run();

      expect(
        listJobRuns(connection.database, {
          type: 'ingest',
          scope: 'claude',
        }),
      ).toEqual([
        expect.objectContaining({
          correlationId: '33333333-3333-4333-8333-333333333333',
          status: 'running',
          startedAt: 300,
          finishedAt: null,
          filesTotal: 8,
          filesDone: 3,
        }),
        expect.objectContaining({
          correlationId: '11111111-1111-4111-8111-111111111111',
          status: 'succeeded',
          startedAt: 100,
          finishedAt: 150,
          filesTotal: 4,
          filesDone: 4,
        }),
      ]);
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
        interactionKey: 'record-1',
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
        interactionKey: 'record-1',
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

describe('categorical breakdowns', () => {
  it('aggregates a token bucket to null only when every contributor is null', async () => {
    const connection = await createDatabase();

    try {
      const { project, session } = await createSessionFixture(
        connection.database,
      );
      const base = {
        sessionId: session.id,
        harness: 'codex',
        projectId: project.id,
        model: 'gpt-5.1-codex-max',
        modelRaw: 'gpt-5.1-codex-max',
        localDow: 0,
        localHour: 0,
        localDate: '1970-01-01',
      } as const;
      insertInteraction(connection.database, {
        ...base,
        interactionKey: 'record-1',
        timestamp: 0,
        mainInputTokens: 10,
        subInputTokens: null,
        mainCacheWriteTokens: null,
        subCacheWriteTokens: null,
      });
      insertInteraction(connection.database, {
        ...base,
        interactionKey: 'record-2',
        timestamp: 1,
        mainInputTokens: null,
        subInputTokens: 5,
        mainCacheWriteTokens: null,
        subCacheWriteTokens: null,
      });

      const [harness] = getHarnessBreakdown(connection.database);
      expect(harness).toMatchObject({
        harness: 'codex',
        interactionCount: 2,
        inputTokens: 15,
        outputTokens: null,
        cacheWriteTokens: null,
        totalTokens: 15,
      });
    } finally {
      connection.sqlite.close();
    }
  });

  it('sums a canonical Model across Harnesses and derives its Provider', async () => {
    const connection = await createDatabase();

    try {
      const { project } = await createSessionFixture(connection.database);
      const [claudeSession] = connection.database
        .insert(sessions)
        .values({
          harness: 'claude',
          stableSessionId: 'claude-1',
          projectId: project.id,
          logFilePath: '/logs/claude-1.jsonl',
        })
        .returning()
        .all();
      const [piSession] = connection.database
        .insert(sessions)
        .values({
          harness: 'pi',
          stableSessionId: 'pi-1',
          projectId: project.id,
          logFilePath: '/logs/pi-1.jsonl',
        })
        .returning()
        .all();

      insertInteraction(connection.database, {
        sessionId: claudeSession.id,
        interactionKey: 'claude-record',
        harness: 'claude',
        projectId: project.id,
        model: 'claude-opus-4-8',
        modelRaw: 'claude-opus-4-8[1m]',
        mainInputTokens: 3,
        timestamp: 0,
        localDow: 0,
        localHour: 0,
        localDate: '1970-01-01',
      });
      insertInteraction(connection.database, {
        sessionId: piSession.id,
        interactionKey: 'pi-record',
        harness: 'pi',
        projectId: project.id,
        model: 'claude-opus-4-8',
        modelRaw: 'claude-opus-4-8',
        mainInputTokens: 4,
        timestamp: 1,
        localDow: 0,
        localHour: 0,
        localDate: '1970-01-01',
      });

      expect(getModelBreakdown(connection.database)).toEqual([
        expect.objectContaining({
          model: 'claude-opus-4-8',
          provider: 'anthropic',
          interactionCount: 2,
          inputTokens: 7,
        }),
      ]);
    } finally {
      connection.sqlite.close();
    }
  });

  it('attributes Interaction counts to each Interaction own Project', async () => {
    const connection = await createDatabase();

    try {
      const { project: alpha, session } = await createSessionFixture(
        connection.database,
      );
      const [beta] = connection.database
        .insert(projects)
        .values({ rootPath: '/work/beta', gitRemoteUrl: null })
        .returning()
        .all();

      insertInteraction(connection.database, {
        sessionId: session.id,
        interactionKey: 'alpha-record',
        harness: 'codex',
        projectId: alpha.id,
        model: 'gpt-5.1-codex-max',
        modelRaw: 'gpt-5.1-codex-max',
        timestamp: 0,
        localDow: 0,
        localHour: 0,
        localDate: '1970-01-01',
      });
      insertInteraction(connection.database, {
        sessionId: session.id,
        interactionKey: 'beta-record',
        harness: 'codex',
        projectId: beta.id,
        model: 'gpt-5.1-codex-max',
        modelRaw: 'gpt-5.1-codex-max',
        timestamp: 1,
        localDow: 0,
        localHour: 0,
        localDate: '1970-01-01',
      });

      expect(
        getProjectBreakdown(connection.database).map((row) => ({
          rootPath: row.rootPath,
          interactionCount: row.interactionCount,
        })),
      ).toEqual([
        { rootPath: '/work/beta', interactionCount: 1 },
        { rootPath: '/work/llm-retro', interactionCount: 1 },
      ]);
    } finally {
      connection.sqlite.close();
    }
  });

  it('averages Session duration over measurable Sessions and discloses exclusions', async () => {
    const connection = await createDatabase();

    try {
      const { project } = await createSessionFixture(connection.database);
      connection.database
        .insert(sessions)
        .values([
          {
            harness: 'codex',
            stableSessionId: 'measured',
            projectId: project.id,
            logFilePath: '/logs/measured.jsonl',
            startedAt: 0,
            endedAt: 1000,
          },
          {
            harness: 'codex',
            stableSessionId: 'zero-duration',
            projectId: project.id,
            logFilePath: '/logs/zero.jsonl',
            startedAt: 500,
            endedAt: 500,
          },
          {
            harness: 'codex',
            stableSessionId: 'timestampless',
            projectId: project.id,
            logFilePath: '/logs/none.jsonl',
          },
          {
            harness: 'claude',
            stableSessionId: 'claude-measured',
            projectId: project.id,
            logFilePath: '/logs/claude.jsonl',
            startedAt: 2000,
            endedAt: 5000,
          },
        ])
        .run();

      const shape = getSessionShape(connection.database);
      expect(shape.totals).toMatchObject({
        sessionCount: 5,
        averageDurationMs: 2000,
        durationExcluded: 3,
      });
      expect(shape.byHarness).toEqual([
        expect.objectContaining({
          harness: 'codex',
          sessionCount: 4,
          averageDurationMs: 1000,
          durationExcluded: 3,
        }),
        expect.objectContaining({
          harness: 'claude',
          sessionCount: 1,
          averageDurationMs: 3000,
          durationExcluded: 0,
        }),
      ]);
    } finally {
      connection.sqlite.close();
    }
  });

  it('averages Interactions per Session from the seeded rows', async () => {
    const connection = await createDatabase();

    try {
      const { project, session } = await createSessionFixture(
        connection.database,
      );
      for (const key of ['a', 'b', 'c']) {
        insertInteraction(connection.database, {
          sessionId: session.id,
          interactionKey: key,
          harness: 'codex',
          projectId: project.id,
          model: 'gpt-5.1-codex-max',
          modelRaw: 'gpt-5.1-codex-max',
          timestamp: key.charCodeAt(0),
          localDow: 0,
          localHour: 0,
          localDate: '1970-01-01',
        });
      }

      const shape = getSessionShape(connection.database);
      expect(shape.totals).toMatchObject({
        sessionCount: 1,
        interactionCount: 3,
        averageInteractionsPerSession: 3,
      });
    } finally {
      connection.sqlite.close();
    }
  });
});
