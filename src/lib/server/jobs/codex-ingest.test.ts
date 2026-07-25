import { join } from 'node:path';
import { interactions, sessions } from '../database/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { codexIngestAdapter } from './codex-adapter';
import { createIngestHandler } from './ingest-pipeline';
import {
  appendCodexJsonLines,
  cleanupCodexIngestFixtures,
  createCodexIngestFixture,
  writeCodexJsonLines,
} from './codex-ingest-fixture';

afterEach(cleanupCodexIngestFixtures);

const sessionMetadata = (stableSessionId: string) => ({
  timestamp: '2025-01-02T20:00:00.000Z',
  type: 'session_meta',
  payload: {
    id: stableSessionId,
    timestamp: '2025-01-02T20:00:00.000Z',
  },
});

const prompt = (timestamp: string) => ({
  timestamp,
  type: 'event_msg',
  payload: { type: 'user_message' },
});

const turnContext = (
  timestamp: string,
  turnId: string | undefined,
  model = 'gpt-5.1-codex-max-20260701',
  cwd = '/work/codex/subdirectory',
) => ({
  timestamp,
  type: 'turn_context',
  payload: { ...(turnId === undefined ? {} : { turn_id: turnId }), cwd, model },
});

const assistant = (timestamp: string) => ({
  timestamp,
  type: 'event_msg',
  payload: { type: 'agent_message' },
});

const tokenCount = (
  timestamp: string,
  last: { input: number; cached: number; output: number },
  total: { input: number; cached: number; output: number },
) => ({
  timestamp,
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: {
        input_tokens: total.input,
        cached_input_tokens: total.cached,
        output_tokens: total.output,
        reasoning_output_tokens: 0,
        total_tokens: total.input + total.output,
      },
      last_token_usage: {
        input_tokens: last.input,
        cached_input_tokens: last.cached,
        output_tokens: last.output,
        reasoning_output_tokens: 0,
        total_tokens: last.input + last.output,
      },
    },
  },
});

const createHandler = (
  resolveProject = vi.fn(async () => ({
    rootPath: '/work/codex',
    gitRemoteUrl: null,
  })),
) =>
  createIngestHandler(codexIngestAdapter, {
    resolveProject,
  });

describe('Codex ingest Job handler', () => {
  it('stores one Interaction for a modern prompt with many model turns', async () => {
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '11111111-1111-4111-8111-111111111111';
    const sessionPath = join(
      fixture.sessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    const firstUsage = tokenCount(
      '2025-01-02T20:01:04.000Z',
      { input: 100, cached: 40, output: 15 },
      { input: 100, cached: 40, output: 15 },
    );
    const secondUsage = tokenCount(
      '2025-01-02T20:01:08.000Z',
      { input: 60, cached: 10, output: 20 },
      { input: 160, cached: 50, output: 35 },
    );

    await writeCodexJsonLines(sessionPath, [
      sessionMetadata(stableSessionId),
      prompt('2025-01-02T20:01:00.000Z'),
      turnContext('2025-01-02T20:01:01.000Z', 'codex-prompt-1'),
      assistant('2025-01-02T20:01:02.000Z'),
      firstUsage,
      { ...firstUsage, timestamp: '2025-01-02T20:01:05.000Z' },
      turnContext(
        '2025-01-02T20:01:06.000Z',
        'codex-prompt-1',
        'gpt-5.2-codex',
        '/work/other-project',
      ),
      assistant('2025-01-02T20:01:07.000Z'),
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
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '22222222-2222-4222-8222-222222222222';
    const sessionPath = join(
      fixture.sessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    await writeCodexJsonLines(sessionPath, [
      sessionMetadata(stableSessionId),
      prompt('2025-01-02T20:02:00.000Z'),
      turnContext('2025-01-02T20:02:01.000Z', undefined),
      assistant('2025-01-02T20:02:02.000Z'),
      tokenCount(
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
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '33333333-3333-4333-8333-333333333333';
    const sessionPath = join(
      fixture.sessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    await writeCodexJsonLines(sessionPath, [
      sessionMetadata(stableSessionId),
      prompt('2025-01-02T20:03:00.000Z'),
      turnContext('2025-01-02T20:03:01.000Z', 'prompt-one'),
      assistant('2025-01-02T20:03:02.000Z'),
      tokenCount(
        '2025-01-02T20:03:03.000Z',
        { input: 50, cached: 20, output: 10 },
        { input: 50, cached: 20, output: 10 },
      ),
      {
        timestamp: '2025-01-02T20:03:04.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'user' },
      },
      prompt('2025-01-02T20:04:00.000Z'),
      turnContext('2025-01-02T20:04:01.000Z', 'prompt-two'),
      assistant('2025-01-02T20:04:02.000Z'),
      tokenCount(
        '2025-01-02T20:04:03.000Z',
        { input: 30, cached: 5, output: 7 },
        { input: 80, cached: 25, output: 17 },
      ),
      prompt('2025-01-02T20:05:00.000Z'),
      turnContext('2025-01-02T20:05:01.000Z', 'unanswered-prompt'),
      tokenCount(
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

  it('rebuilds an in-flight Interaction consistently when a session grows', async () => {
    const fixture = await createCodexIngestFixture();
    const fullFixture = await createCodexIngestFixture();
    const stableSessionId = '44444444-4444-4444-8444-444444444444';
    const sessionPath = join(
      fixture.sessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    const fullSessionPath = join(
      fullFixture.sessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    const firstPromptUsage = tokenCount(
      '2025-01-02T20:06:03.000Z',
      { input: 100, cached: 40, output: 20 },
      { input: 100, cached: 40, output: 20 },
    );
    const secondPromptFirstUsage = tokenCount(
      '2025-01-02T20:07:03.000Z',
      { input: 50, cached: 10, output: 8 },
      { input: 150, cached: 50, output: 28 },
    );
    const initialRecords = [
      sessionMetadata(stableSessionId),
      prompt('2025-01-02T20:06:00.000Z'),
      turnContext('2025-01-02T20:06:01.000Z', 'complete-prompt'),
      assistant('2025-01-02T20:06:02.000Z'),
      firstPromptUsage,
      { ...firstPromptUsage, timestamp: '2025-01-02T20:06:04.000Z' },
      prompt('2025-01-02T20:07:00.000Z'),
      turnContext('2025-01-02T20:07:01.000Z', 'growing-prompt'),
      assistant('2025-01-02T20:07:02.000Z'),
      secondPromptFirstUsage,
      {
        ...secondPromptFirstUsage,
        timestamp: '2025-01-02T20:07:04.000Z',
      },
    ];
    await writeCodexJsonLines(sessionPath, initialRecords);

    try {
      const handler = createHandler();
      await handler.run(null, {
        correlationId: 'before-growth',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      const secondPromptNextUsage = tokenCount(
        '2025-01-02T20:07:08.000Z',
        { input: 70, cached: 20, output: 12 },
        { input: 220, cached: 70, output: 40 },
      );
      const appendedRecords = [
        turnContext('2025-01-02T20:07:06.000Z', 'growing-prompt'),
        assistant('2025-01-02T20:07:07.000Z'),
        secondPromptNextUsage,
        {
          ...secondPromptNextUsage,
          timestamp: '2025-01-02T20:07:09.000Z',
        },
      ];
      await appendCodexJsonLines(sessionPath, appendedRecords);
      await handler.run(null, {
        correlationId: 'after-growth',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      await writeCodexJsonLines(fullSessionPath, [
        ...initialRecords,
        ...appendedRecords,
      ]);
      await createHandler().run(null, {
        correlationId: 'full-ingest',
        database: fullFixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      const selectTotals = {
        interactionKey: interactions.interactionKey,
        mainInputTokens: interactions.mainInputTokens,
        mainCacheReadTokens: interactions.mainCacheReadTokens,
        mainOutputTokens: interactions.mainOutputTokens,
      };
      const resumedTotals = fixture.database
        .select(selectTotals)
        .from(interactions)
        .all();
      const fullTotals = fullFixture.database
        .select(selectTotals)
        .from(interactions)
        .all();
      expect(resumedTotals).toEqual(fullTotals);
      expect(resumedTotals).toEqual([
        {
          interactionKey: 'complete-prompt',
          mainInputTokens: 60,
          mainCacheReadTokens: 40,
          mainOutputTokens: 20,
        },
        {
          interactionKey: 'growing-prompt',
          mainInputTokens: 90,
          mainCacheReadTokens: 30,
          mainOutputTokens: 20,
        },
      ]);
    } finally {
      fixture.sqlite.close();
      fullFixture.sqlite.close();
    }
  });

  it('ingests a rollout found only in archived_sessions storage', async () => {
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '55555555-5555-4555-8555-555555555555';
    const archivedPath = join(
      fixture.archivedSessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    await writeCodexJsonLines(archivedPath, [
      sessionMetadata(stableSessionId),
      prompt('2025-01-02T20:08:00.000Z'),
      turnContext(
        '2025-01-02T20:08:01.000Z',
        'archived-prompt',
        'gpt-5.1-codex',
        '/work/codex',
      ),
      assistant('2025-01-02T20:08:02.000Z'),
      tokenCount(
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
