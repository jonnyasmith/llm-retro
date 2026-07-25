import { join } from 'node:path';
import { interactions, sessions } from '../database/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { codexIngestAdapter } from './codex-adapter';
import { createIngestHandler } from './ingest-pipeline';
import {
  cleanupIngestFixtures,
  codexRecords,
  createIngestFixture,
  writeJsonLines,
} from './ingest-fixture';

afterEach(cleanupIngestFixtures);

const createHandler = (
  resolveProject = vi.fn(async () => ({
    rootPath: '/work/codex',
    gitRemoteUrl: null,
  })),
) =>
  createIngestHandler(codexIngestAdapter, {
    resolveProject,
  });

describe('Codex log grammar', () => {
  it('stores one Interaction for a modern prompt with many model turns', async () => {
    const fixture = await createIngestFixture('codex');
    const stableSessionId = '11111111-1111-4111-8111-111111111111';
    const sessionPath = fixture.sessionPath(stableSessionId);
    const firstUsage = codexRecords.tokenCount(
      '2025-01-02T20:01:04.000Z',
      { input: 100, cached: 40, output: 15 },
      { input: 100, cached: 40, output: 15 },
    );
    const secondUsage = codexRecords.tokenCount(
      '2025-01-02T20:01:08.000Z',
      { input: 60, cached: 10, output: 20 },
      { input: 160, cached: 50, output: 35 },
    );

    await writeJsonLines(sessionPath, [
      codexRecords.sessionMetadata(stableSessionId),
      codexRecords.prompt('2025-01-02T20:01:00.000Z'),
      codexRecords.turnContext('2025-01-02T20:01:01.000Z', 'codex-prompt-1'),
      codexRecords.assistant('2025-01-02T20:01:02.000Z'),
      firstUsage,
      { ...firstUsage, timestamp: '2025-01-02T20:01:05.000Z' },
      codexRecords.turnContext(
        '2025-01-02T20:01:06.000Z',
        'codex-prompt-1',
        'gpt-5.2-codex',
        '/work/other-project',
      ),
      codexRecords.assistant('2025-01-02T20:01:07.000Z'),
      secondUsage,
      { ...secondUsage, timestamp: '2025-01-02T20:01:09.000Z' },
    ]);

    const resolveProject = vi.fn(async () => ({
      rootPath: '/work/codex',
      gitRemoteUrl: null,
    }));
    try {
      await createHandler(resolveProject).run(null, {
        correlationId: 'modern-multi-turn',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'codex-prompt-1',
          model: 'gpt-5.1-codex-max',
          modelRaw: 'gpt-5.1-codex-max-20260701',
          mainInputTokens: 110,
          mainCacheReadTokens: 50,
          mainOutputTokens: 35,
          mainCacheWriteTokens: null,
          timestamp: Date.parse('2025-01-02T20:01:00.000Z'),
        }),
      ]);
      expect(resolveProject).toHaveBeenCalledTimes(1);
      expect(resolveProject).toHaveBeenCalledWith('/work/codex/subdirectory');
    } finally {
      fixture.sqlite.close();
    }
  });

  it('keys an older Interaction without turn_id by its prompt timestamp', async () => {
    const fixture = await createIngestFixture('codex');
    const stableSessionId = '22222222-2222-4222-8222-222222222222';
    const sessionPath = fixture.sessionPath(stableSessionId);
    await writeJsonLines(sessionPath, [
      codexRecords.sessionMetadata(stableSessionId),
      codexRecords.prompt('2025-01-02T20:02:00.000Z'),
      codexRecords.turnContext('2025-01-02T20:02:01.000Z', undefined),
      codexRecords.assistant('2025-01-02T20:02:02.000Z'),
      codexRecords.tokenCount(
        '2025-01-02T20:02:03.000Z',
        { input: 10, cached: 2, output: 3 },
        { input: 10, cached: 2, output: 3 },
      ),
    ]);

    try {
      await createHandler().run(null, {
        correlationId: 'old-prompt',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: '2025-01-02T20:02:00.000Z',
          mainInputTokens: 8,
          mainCacheReadTokens: 2,
          mainOutputTokens: 3,
        }),
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('attributes cumulative token deltas to genuine prompt boundaries', async () => {
    const fixture = await createIngestFixture('codex');
    const stableSessionId = '33333333-3333-4333-8333-333333333333';
    const sessionPath = fixture.sessionPath(stableSessionId);
    await writeJsonLines(sessionPath, [
      codexRecords.sessionMetadata(stableSessionId),
      codexRecords.prompt('2025-01-02T20:03:00.000Z'),
      codexRecords.turnContext('2025-01-02T20:03:01.000Z', 'prompt-one'),
      codexRecords.assistant('2025-01-02T20:03:02.000Z'),
      codexRecords.tokenCount(
        '2025-01-02T20:03:03.000Z',
        { input: 50, cached: 20, output: 10 },
        { input: 50, cached: 20, output: 10 },
      ),
      {
        timestamp: '2025-01-02T20:03:04.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'user' },
      },
      codexRecords.prompt('2025-01-02T20:04:00.000Z'),
      codexRecords.turnContext('2025-01-02T20:04:01.000Z', 'prompt-two'),
      codexRecords.assistant('2025-01-02T20:04:02.000Z'),
      codexRecords.tokenCount(
        '2025-01-02T20:04:03.000Z',
        { input: 30, cached: 5, output: 7 },
        { input: 80, cached: 25, output: 17 },
      ),
      codexRecords.prompt('2025-01-02T20:05:00.000Z'),
      codexRecords.turnContext('2025-01-02T20:05:01.000Z', 'unanswered-prompt'),
      codexRecords.tokenCount(
        '2025-01-02T20:05:02.000Z',
        { input: 20, cached: 5, output: 0 },
        { input: 100, cached: 30, output: 17 },
      ),
    ]);

    try {
      await createHandler().run(null, {
        correlationId: 'multiple-prompts',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'prompt-one',
          mainInputTokens: 30,
          mainCacheReadTokens: 20,
          mainOutputTokens: 10,
        }),
        expect.objectContaining({
          interactionKey: 'prompt-two',
          mainInputTokens: 25,
          mainCacheReadTokens: 5,
          mainOutputTokens: 7,
        }),
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('ingests a rollout found only in archived_sessions storage', async () => {
    const fixture = await createIngestFixture('codex');
    const stableSessionId = '55555555-5555-4555-8555-555555555555';
    const [, archivedSessions] = fixture.logSources;
    const archivedPath = join(
      archivedSessions,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    await writeJsonLines(archivedPath, [
      codexRecords.sessionMetadata(stableSessionId),
      codexRecords.prompt('2025-01-02T20:08:00.000Z'),
      codexRecords.turnContext(
        '2025-01-02T20:08:01.000Z',
        'archived-prompt',
        'gpt-5.1-codex',
        '/work/codex',
      ),
      codexRecords.assistant('2025-01-02T20:08:02.000Z'),
      codexRecords.tokenCount(
        '2025-01-02T20:08:03.000Z',
        { input: 10, cached: 2, output: 3 },
        { input: 10, cached: 2, output: 3 },
      ),
    ]);

    try {
      await createHandler().run(null, {
        correlationId: 'archived-rollout',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          stableSessionId,
          logFilePath: archivedPath,
        }),
      ]);
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({ interactionKey: 'archived-prompt' }),
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });
});
