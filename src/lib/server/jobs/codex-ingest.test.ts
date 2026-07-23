import { join } from 'node:path';
import { interactions, sessions } from '../database/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCodexIngestHandler, createCodexIngestJob } from './codex-ingest';
import {
  cleanupCodexIngestFixtures,
  createCodexIngestFixture,
  writeCodexJsonLines,
} from './codex-ingest-fixture';

afterEach(cleanupCodexIngestFixtures);

function rolloutRecords(
  stableSessionId: string,
  turns: Array<{ interactionKey: string; cwd: string }>,
) {
  return [
    {
      timestamp: '2025-01-02T20:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: stableSessionId,
        timestamp: '2025-01-02T20:00:00.000Z',
      },
    },
    ...turns.flatMap((turn, index) => {
      const minute = String(index + 1).padStart(2, '0');
      return [
        {
          timestamp: `2025-01-02T20:${minute}:00.000Z`,
          type: 'turn_context',
          payload: {
            turn_id: turn.interactionKey,
            cwd: turn.cwd,
            model: 'gpt-5.1-codex',
          },
        },
        {
          timestamp: `2025-01-02T20:${minute}:01.000Z`,
          type: 'event_msg',
          payload: { type: 'user_message' },
        },
        {
          timestamp: `2025-01-02T20:${minute}:02.000Z`,
          type: 'event_msg',
          payload: { type: 'agent_message' },
        },
        {
          timestamp: `2025-01-02T20:${minute}:03.000Z`,
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: {
                input_tokens: 10,
                cached_input_tokens: 2,
                output_tokens: 3,
                reasoning_output_tokens: 1,
                total_tokens: 13,
              },
            },
          },
        },
        {
          timestamp: `2025-01-02T20:${minute}:04.000Z`,
          type: 'event_msg',
          payload: { type: 'task_complete' },
        },
      ];
    }),
  ];
}

describe('Codex ingest Job handler', () => {
  it('stores only genuine responded turns with delta-summed tokens and turn-context attribution', async () => {
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '11111111-1111-4111-8111-111111111111';
    const sessionPath = join(
      fixture.sessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    const event = (timestamp: string, type: string, payload = {}) => ({
      timestamp,
      type: 'event_msg',
      payload: { type, ...payload },
    });
    const usage = (
      inputTokens: number,
      cachedInputTokens: number,
      outputTokens: number,
      reasoningOutputTokens: number,
    ) => ({
      info: {
        total_token_usage: {
          input_tokens: 999_999,
          cached_input_tokens: 888_888,
          output_tokens: 777_777,
          reasoning_output_tokens: 666_666,
          total_tokens: 1_777_776,
        },
        last_token_usage: {
          input_tokens: inputTokens,
          cached_input_tokens: cachedInputTokens,
          output_tokens: outputTokens,
          reasoning_output_tokens: reasoningOutputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      },
    });

    await writeCodexJsonLines(sessionPath, [
      {
        timestamp: '2025-01-02T20:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: stableSessionId,
          timestamp: '2025-01-02T20:00:00.000Z',
          cwd: '/metadata/must-not-be-used',
        },
      },
      event('2025-01-02T20:00:01.000Z', 'task_started'),
      event('2025-01-02T20:00:02.000Z', 'user_message'),
      event('2025-01-02T20:00:03.000Z', 'agent_message', {
        model: 'wrong-compaction-model',
      }),
      event(
        '2025-01-02T20:00:04.000Z',
        'token_count',
        usage(9_000, 8_000, 7_000, 6_000),
      ),
      event('2025-01-02T20:00:05.000Z', 'task_complete'),
      {
        timestamp: '2025-01-02T20:10:00.000Z',
        type: 'turn_context',
        payload: {
          turn_id: 'codex-turn-1',
          cwd: '/work/codex/subdirectory',
          model: 'gpt-5.1-codex-max-20260701',
        },
      },
      {
        timestamp: '2025-01-02T20:10:01.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'user', model: 'wrong-model' },
      },
      event('2025-01-02T20:10:02.000Z', 'user_message', {
        cwd: '/user-message/must-not-be-used',
      }),
      event('2025-01-02T20:10:03.000Z', 'agent_message', {
        model: 'wrong-agent-model',
      }),
      event('2025-01-02T20:10:04.000Z', 'token_count', usage(100, 40, 15, 5)),
      event('2025-01-02T20:10:05.000Z', 'token_count', usage(60, 10, 20, 8)),
      event('2025-01-02T20:10:06.000Z', 'task_complete'),
      event('2025-01-02T20:11:00.000Z', 'task_started'),
      event(
        '2025-01-02T20:11:01.000Z',
        'token_count',
        usage(5_000, 4_000, 3_000, 2_000),
      ),
      event('2025-01-02T20:11:02.000Z', 'task_complete'),
      {
        timestamp: '2025-01-02T20:20:00.000Z',
        type: 'turn_context',
        payload: {
          turn_id: 'codex-turn-response-item-only',
          cwd: '/work/codex/subdirectory',
          model: 'gpt-5.2-codex',
        },
      },
      {
        timestamp: '2025-01-02T20:20:01.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'user' },
      },
      event('2025-01-02T20:20:02.000Z', 'agent_message'),
      event('2025-01-02T20:20:03.000Z', 'token_count', usage(70, 20, 30, 9)),
      event('2025-01-02T20:20:04.000Z', 'task_complete'),
      {
        timestamp: '2025-01-02T20:30:00.000Z',
        type: 'turn_context',
        payload: {
          turn_id: 'codex-turn-no-response',
          cwd: '/work/codex/subdirectory',
          model: 'gpt-5.3-codex',
        },
      },
      event('2025-01-02T20:30:01.000Z', 'user_message'),
      event('2025-01-02T20:30:02.000Z', 'task_complete'),
    ]);

    const resolveProject = vi.fn(async () => ({
      rootPath: '/work/codex',
      gitRemoteUrl: 'git@example.com:codex.git',
    }));
    const handler = createCodexIngestHandler({ resolveProject });

    try {
      await handler.run(null, {
        correlationId: 'codex-correlation-1',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          harness: 'codex',
          stableSessionId,
          logFilePath: sessionPath,
          startedAt: Date.parse('2025-01-02T20:00:00.000Z'),
          endedAt: Date.parse('2025-01-02T20:30:02.000Z'),
        }),
      ]);
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'codex-turn-1',
          harness: 'codex',
          model: 'gpt-5.1-codex-max',
          modelRaw: 'gpt-5.1-codex-max-20260701',
          mainInputTokens: 110,
          mainOutputTokens: 35,
          mainCacheReadTokens: 50,
          mainCacheWriteTokens: null,
          subInputTokens: null,
          subOutputTokens: null,
          subCacheReadTokens: null,
          subCacheWriteTokens: null,
          spawnedSubagents: false,
          timestamp: Date.parse('2025-01-02T20:10:00.000Z'),
          localDow: 5,
          localHour: 1,
          localDate: '2025-01-03',
        }),
      ]);
      // turn_context cwd (not session_meta or user_message cwd) drives attribution
      expect(resolveProject.mock.calls).toEqual([['/work/codex/subdirectory']]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('sums per-round-trip token deltas across a turn and ignores cumulative resets', async () => {
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '55555555-5555-4555-8555-555555555555';
    const sessionPath = join(
      fixture.sessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    // Each token_count carries a per-round-trip `last_token_usage` delta that
    // must be summed, plus a cumulative `total_token_usage` that resets on
    // compaction. The parser must sum the deltas and ignore the cumulative.
    const tokenCount = (
      last: { input: number; cached: number; output: number },
      cumulativeInput: number,
    ) => ({
      timestamp: '2025-01-02T20:10:03.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: cumulativeInput,
            cached_input_tokens: 0,
            output_tokens: cumulativeInput,
            reasoning_output_tokens: 0,
            total_tokens: cumulativeInput * 2,
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

    await writeCodexJsonLines(sessionPath, [
      {
        timestamp: '2025-01-02T20:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: stableSessionId,
          timestamp: '2025-01-02T20:00:00.000Z',
        },
      },
      {
        timestamp: '2025-01-02T20:10:00.000Z',
        type: 'turn_context',
        payload: {
          turn_id: 'codex-turn-delta-sum',
          cwd: '/work/codex/subdirectory',
          model: 'gpt-5.1-codex',
        },
      },
      {
        timestamp: '2025-01-02T20:10:01.000Z',
        type: 'event_msg',
        payload: { type: 'user_message' },
      },
      {
        timestamp: '2025-01-02T20:10:02.000Z',
        type: 'event_msg',
        payload: { type: 'agent_message' },
      },
      // Round-trip 1: cumulative climbs to 200.
      tokenCount({ input: 200, cached: 50, output: 30 }, 200),
      // Round-trip 2: cumulative climbs to 320.
      tokenCount({ input: 120, cached: 20, output: 40 }, 320),
      // Compaction resets the cumulative back to 80; the delta still counts.
      tokenCount({ input: 80, cached: 10, output: 25 }, 80),
      {
        timestamp: '2025-01-02T20:10:04.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete' },
      },
    ]);

    const handler = createCodexIngestHandler({
      resolveProject: async () => ({
        rootPath: '/work/codex',
        gitRemoteUrl: null,
      }),
    });

    try {
      await handler.run(null, {
        correlationId: 'codex-delta-sum',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      // Disjoint buckets summed across all three round-trips:
      //   input     = (200-50) + (120-20) + (80-10) = 150 + 100 + 70 = 320
      //   cacheRead =       50 +       20 +      10  =                  80
      //   output    =       30 +       40 +      25  =                  95
      //   cacheWrite is never reported by Codex -> null
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'codex-turn-delta-sum',
          mainInputTokens: 320,
          mainCacheReadTokens: 80,
          mainOutputTokens: 95,
          mainCacheWriteTokens: null,
        }),
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('ingests a rollout found only in flat archived_sessions storage', async () => {
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '44444444-4444-4444-8444-444444444444';
    const archivedPath = join(
      fixture.archivedSessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    await writeCodexJsonLines(
      archivedPath,
      rolloutRecords(stableSessionId, [
        { interactionKey: 'turn-archived-only', cwd: '/work/archived-only' },
      ]),
    );

    try {
      await createCodexIngestHandler({
        resolveProject: async () => ({
          rootPath: '/work/archived-only',
          gitRemoteUrl: null,
        }),
      }).run(null, {
        correlationId: 'codex-archived-only',
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
        expect.objectContaining({
          interactionKey: 'turn-archived-only',
        }),
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('exposes the Codex-scoped empty-payload Job', () => {
    expect(createCodexIngestJob()).toEqual({
      identity: { type: 'ingest', scope: 'codex' },
      payload: null,
    });
  });
});
