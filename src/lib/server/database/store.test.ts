import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Connection, type Database } from './connection';
import { IngestionActiveError } from '../settings/errors';
import { interactions, jobRuns, projects, sessions, settings } from './schema';
import {
  getActivityHeatmap,
  getHarnessBreakdown,
  getModelBreakdown,
  getOverviewTotals,
  getProjectBreakdown,
  getSessionShape,
  getSettings,
  listJobRuns,
  resolveDefaultLogSources,
  persistSettings,
} from './store';

let dataDirectory!: string;
let connection!: Connection;
let database!: Database;

beforeEach(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-store-'));
  connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  database = connection.database;
});

afterEach(async () => {
  connection.close();
  await rm(dataDirectory, { recursive: true, force: true });
});

function createSessionFixture() {
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

function seedInteraction(interaction: typeof interactions.$inferInsert) {
  const [stored] = database
    .insert(interactions)
    .values(interaction)
    .returning()
    .all();

  return stored;
}

describe('analytical Store', () => {
  describe('holding no Interactions', () => {
    it('counts no Interactions', () => {
      expect(getOverviewTotals(database).interactionCount).toBe(0);
    });

    it('totals its tokens as a genuine zero rather than an absence', () => {
      expect(getOverviewTotals(database).totalTokens).toBe(0);
    });

    it('reports an empty activity heatmap', () => {
      expect(getActivityHeatmap(database)).toEqual([]);
    });
  });

  describe('holding an Interaction that reports only some token buckets', () => {
    let stored!: typeof interactions.$inferSelect;

    beforeEach(() => {
      const { project, session } = createSessionFixture();
      stored = seedInteraction({
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
    });

    it('retains a reported zero bucket as a zero', () => {
      expect(stored.mainInputTokens).toBe(0);
    });

    it('retains an explicitly absent bucket as absent', () => {
      expect(stored.mainOutputTokens).toBeNull();
    });

    it('records an unmentioned bucket as absent', () => {
      expect(stored.subInputTokens).toBeNull();
    });
  });

  describe('holding Interactions spread over several local buckets', () => {
    beforeEach(() => {
      const { project, session } = createSessionFixture();
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
        seedInteraction({
          sessionId: session.id,
          harness: 'codex',
          projectId: project.id,
          model: 'gpt-5.1-codex-max',
          modelRaw: 'gpt-5.1-codex-max',
          timestamp: index,
          ...fact,
        });
      }
    });

    it('counts every Interaction it holds', () => {
      expect(getOverviewTotals(database).interactionCount).toBe(3);
    });

    it('totals the reported main and sub token buckets of every Interaction', () => {
      expect(getOverviewTotals(database).totalTokens).toBe(192);
    });

    it('counts the Interactions sharing a local day and hour as one heatmap bucket', () => {
      expect(getActivityHeatmap(database)).toContainEqual({
        localDow: 1,
        localHour: 9,
        interactionCount: 2,
      });
      expect(getActivityHeatmap(database)).toContainEqual({
        localDow: 6,
        localHour: 23,
        interactionCount: 1,
      });
    });

    it('orders the heatmap buckets by local day then local hour', () => {
      expect(
        getActivityHeatmap(database).map((bucket) => [
          bucket.localDow,
          bucket.localHour,
        ]),
      ).toEqual([
        [1, 9],
        [6, 23],
      ]);
    });
  });

  describe('holding Job runs of more than one identity', () => {
    const finishedIngest = '11111111-1111-4111-8111-111111111111';
    const unrelatedRun = '22222222-2222-4222-8222-222222222222';
    const runningIngest = '33333333-3333-4333-8333-333333333333';
    const ingestHistory = () =>
      listJobRuns(database, { type: 'ingest', scope: 'claude' });

    beforeEach(() => {
      database
        .insert(jobRuns)
        .values([
          {
            type: 'ingest',
            scope: 'claude',
            correlationId: finishedIngest,
            status: 'succeeded',
            startedAt: 100,
            finishedAt: 150,
            filesTotal: 4,
            filesDone: 4,
          },
          {
            type: 'stub',
            scope: '',
            correlationId: unrelatedRun,
            status: 'succeeded',
            startedAt: 200,
            finishedAt: 250,
          },
          {
            type: 'ingest',
            scope: 'claude',
            correlationId: runningIngest,
            status: 'running',
            startedAt: 300,
            filesTotal: 8,
            filesDone: 3,
          },
        ])
        .run();
    });

    it('returns only the Job runs of the requested type and scope', () => {
      const history = ingestHistory();

      expect(history).toHaveLength(2);
      expect(history.map((run) => run.correlationId)).not.toContain(
        unrelatedRun,
      );
    });

    it('returns the matching Job runs newest first', () => {
      expect(ingestHistory().map((run) => run.correlationId)).toEqual([
        runningIngest,
        finishedIngest,
      ]);
    });

    it('reports the timing and per-file progress of a finished Job run', () => {
      expect(
        ingestHistory().find((run) => run.correlationId === finishedIngest),
      ).toMatchObject({
        status: 'succeeded',
        startedAt: 100,
        finishedAt: 150,
        filesTotal: 4,
        filesDone: 4,
      });
    });

    it('reports a running Job run as unfinished with the progress so far', () => {
      expect(
        ingestHistory().find((run) => run.correlationId === runningIngest),
      ).toMatchObject({
        status: 'running',
        startedAt: 300,
        finishedAt: null,
        filesTotal: 8,
        filesDone: 3,
      });
    });
  });

  describe('holding no stored Settings', () => {
    const operatingSystemTimezone = () => 'Europe/London';

    it('falls back to the operating system timezone', () => {
      expect(getSettings(database, operatingSystemTimezone).timezone).toBe(
        'Europe/London',
      );
    });

    it('leaves raw archiving off with no archive path', () => {
      expect(getSettings(database, operatingSystemTimezone)).toMatchObject({
        rawArchiveEnabled: false,
        rawArchivePath: null,
      });
    });

    it('reports the conventional Harness log sources and no overrides', () => {
      expect(getSettings(database, operatingSystemTimezone)).toMatchObject({
        logSourceOverrides: {},
        logSources: resolveDefaultLogSources(),
      });
    });

    it('reads its defaults without writing a Settings row', () => {
      getSettings(database, operatingSystemTimezone);

      expect(database.select().from(settings).all()).toHaveLength(0);
    });
  });

  describe('holding Settings that override every preference', () => {
    beforeEach(() => {
      persistSettings(database, {
        timezone: 'Asia/Kolkata',
        rawArchiveEnabled: true,
        rawArchivePath: '/archive',
        logSourceOverrides: { codex: ['/logs/codex'] },
      });
    });

    it('reports the stored timezone in place of the operating system one', () => {
      expect(getSettings(database).timezone).toBe('Asia/Kolkata');
    });

    it('reports the stored raw archive preference and path', () => {
      expect(getSettings(database)).toMatchObject({
        rawArchiveEnabled: true,
        rawArchivePath: '/archive',
      });
    });

    it('reports the stored log source overrides', () => {
      expect(getSettings(database).logSourceOverrides).toEqual({
        codex: ['/logs/codex'],
      });
    });

    it('layers the stored overrides over the conventional Harness paths', () => {
      expect(getSettings(database).logSources).toEqual({
        ...resolveDefaultLogSources(),
        codex: ['/logs/codex'],
      });
    });

    it('overwrites the preferences a later partial change names', () => {
      persistSettings(database, {
        rawArchiveEnabled: false,
        rawArchivePath: null,
      });

      expect(getSettings(database)).toMatchObject({
        rawArchiveEnabled: false,
        rawArchivePath: null,
      });
    });
  });

  describe('holding a log source override for one Harness', () => {
    beforeEach(() => {
      persistSettings(database, {
        logSourceOverrides: { claude: ['/external/claude'] },
      });
    });

    it('replaces the paths of the overridden Harness alone', () => {
      expect(getSettings(database).logSources).toEqual({
        ...resolveDefaultLogSources(),
        claude: ['/external/claude'],
      });
    });
  });

  describe('holding an Interaction bucketed in the stored timezone', () => {
    const moveTimezone = () =>
      persistSettings(database, { timezone: 'Asia/Kolkata' });
    const storedInteraction = () => database.select().from(interactions).get();

    beforeEach(() => {
      persistSettings(database, { timezone: 'Europe/London' });
      const { project, session } = createSessionFixture();
      seedInteraction({
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
    });

    it('recomputes every local bucket from the stored UTC instant when the timezone moves', () => {
      moveTimezone();

      expect(storedInteraction()).toMatchObject({
        timestamp: Date.parse('2025-01-01T20:00:00.000Z'),
        localDow: 4,
        localHour: 1,
        localDate: '2025-01-02',
      });
    });

    describe('whose Settings row rejects the write', () => {
      beforeEach(() => {
        connection.unsafeSqlite.exec(`
          create trigger reject_timezone_update
          before update on settings
          begin
            select raise(abort, 'settings update rejected');
          end;
        `);
      });

      it('reports the rejection to the caller', () => {
        expect(moveTimezone).toThrow(/settings update rejected/);
      });

      it('leaves the stored timezone unchanged', () => {
        expect(moveTimezone).toThrow();

        expect(getSettings(database).timezone).toBe('Europe/London');
      });

      it('leaves every local bucket unchanged', () => {
        expect(moveTimezone).toThrow();

        expect(storedInteraction()).toMatchObject({
          localDow: 3,
          localHour: 20,
          localDate: '2025-01-01',
        });
      });
    });

    describe('while an ingest Job run is running', () => {
      beforeEach(() => {
        database
          .insert(jobRuns)
          .values({
            type: 'ingest',
            scope: 'codex',
            correlationId: '44444444-4444-4444-8444-444444444444',
            status: 'running',
            startedAt: 400,
          })
          .run();
      });

      it('refuses to move the timezone under the running ingest', () => {
        expect(moveTimezone).toThrow(IngestionActiveError);
      });

      it('leaves every local bucket unchanged', () => {
        expect(moveTimezone).toThrow();

        expect(storedInteraction()).toMatchObject({
          localDow: 3,
          localHour: 20,
          localDate: '2025-01-01',
        });
      });

      it('accepts a change that leaves the timezone where it is', () => {
        persistSettings(database, { rawArchiveEnabled: true });

        expect(getSettings(database).rawArchiveEnabled).toBe(true);
      });
    });
  });
});

describe('categorical breakdowns', () => {
  describe('over Interactions whose token buckets are partly absent', () => {
    beforeEach(() => {
      const { project, session } = createSessionFixture();
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
      seedInteraction({
        ...base,
        interactionKey: 'record-1',
        timestamp: 0,
        mainInputTokens: 10,
        subInputTokens: null,
        mainCacheWriteTokens: null,
        subCacheWriteTokens: null,
      });
      seedInteraction({
        ...base,
        interactionKey: 'record-2',
        timestamp: 1,
        mainInputTokens: null,
        subInputTokens: 5,
        mainCacheWriteTokens: null,
        subCacheWriteTokens: null,
      });
    });

    it('groups the Interactions under the Harness that ran them', () => {
      const [harness] = getHarnessBreakdown(database);

      expect(harness).toMatchObject({ harness: 'codex', interactionCount: 2 });
    });

    it('sums a bucket over the Interactions that report it', () => {
      const [harness] = getHarnessBreakdown(database);

      expect(harness.inputTokens).toBe(15);
    });

    it.each([
      { bucket: 'outputTokens' as const },
      { bucket: 'cacheWriteTokens' as const },
    ])(
      'reports the $bucket bucket as absent when every Interaction leaves it absent',
      ({ bucket }) => {
        const [harness] = getHarnessBreakdown(database);

        expect(harness[bucket]).toBeNull();
      },
    );

    it('totals only the buckets the Interactions report', () => {
      const [harness] = getHarnessBreakdown(database);

      expect(harness.totalTokens).toBe(15);
    });
  });

  describe('over one Model run under several Harnesses', () => {
    beforeEach(() => {
      const { project } = createSessionFixture();
      const [claudeSession] = database
        .insert(sessions)
        .values({
          harness: 'claude',
          stableSessionId: 'claude-1',
          projectId: project.id,
          logFilePath: '/logs/claude-1.jsonl',
        })
        .returning()
        .all();
      const [piSession] = database
        .insert(sessions)
        .values({
          harness: 'pi',
          stableSessionId: 'pi-1',
          projectId: project.id,
          logFilePath: '/logs/pi-1.jsonl',
        })
        .returning()
        .all();

      seedInteraction({
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
      seedInteraction({
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
    });

    it('collapses the canonical Model into a single row', () => {
      expect(getModelBreakdown(database).map((row) => row.model)).toEqual([
        'claude-opus-4-8',
      ]);
    });

    it('counts the Interactions of the Model across the Harnesses that ran it', () => {
      const [model] = getModelBreakdown(database);

      expect(model.interactionCount).toBe(2);
    });

    it('sums the token buckets of the Model across the Harnesses that ran it', () => {
      const [model] = getModelBreakdown(database);

      expect(model.inputTokens).toBe(7);
    });

    it('derives the Provider of the Model', () => {
      const [model] = getModelBreakdown(database);

      expect(model.provider).toBe('anthropic');
    });
  });

  describe('over Interactions attributed to more than one Project', () => {
    beforeEach(() => {
      const { project: alpha, session } = createSessionFixture();
      const [beta] = database
        .insert(projects)
        .values({ rootPath: '/work/beta', gitRemoteUrl: null })
        .returning()
        .all();

      seedInteraction({
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
      seedInteraction({
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
    });

    it('counts each Interaction against its own Project rather than its Session', () => {
      expect(
        Object.fromEntries(
          getProjectBreakdown(database).map((row) => [
            row.rootPath,
            row.interactionCount,
          ]),
        ),
      ).toEqual({ '/work/beta': 1, '/work/llm-retro': 1 });
    });

    it('orders equally busy Projects by root path', () => {
      expect(getProjectBreakdown(database).map((row) => row.rootPath)).toEqual([
        '/work/beta',
        '/work/llm-retro',
      ]);
    });
  });

  describe('over Sessions of which only some have a measurable duration', () => {
    beforeEach(() => {
      const { project } = createSessionFixture();
      database
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
    });

    it('counts every Session it holds', () => {
      expect(getSessionShape(database).totals.sessionCount).toBe(5);
    });

    it('averages the duration of the measurable Sessions alone', () => {
      expect(getSessionShape(database).totals.averageDurationMs).toBe(2000);
    });

    it('discloses how many Sessions it could not measure', () => {
      expect(getSessionShape(database).totals.durationExcluded).toBe(3);
    });

    it('counts the Sessions of each Harness, most numerous first', () => {
      expect(
        getSessionShape(database).byHarness.map((row) => [
          row.harness,
          row.sessionCount,
        ]),
      ).toEqual([
        ['codex', 4],
        ['claude', 1],
      ]);
    });

    it('averages the duration of the measurable Sessions within each Harness', () => {
      expect(
        getSessionShape(database).byHarness.map((row) => [
          row.harness,
          row.averageDurationMs,
        ]),
      ).toEqual([
        ['codex', 1000],
        ['claude', 3000],
      ]);
    });

    it('discloses the unmeasurable Sessions of each Harness', () => {
      expect(
        getSessionShape(database).byHarness.map((row) => [
          row.harness,
          row.durationExcluded,
        ]),
      ).toEqual([
        ['codex', 3],
        ['claude', 0],
      ]);
    });
  });

  describe('over one Session holding several Interactions', () => {
    beforeEach(() => {
      const { project, session } = createSessionFixture();
      for (const key of ['a', 'b', 'c']) {
        seedInteraction({
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
    });

    it('counts every Interaction across its Sessions', () => {
      expect(getSessionShape(database).totals.interactionCount).toBe(3);
    });

    it('averages its Interactions over the Sessions holding them', () => {
      expect(getSessionShape(database).totals).toMatchObject({
        sessionCount: 1,
        averageInteractionsPerSession: 3,
      });
    });
  });
});
