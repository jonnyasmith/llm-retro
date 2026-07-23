import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkpoints,
  interactions,
  projects,
  sessions,
} from '../database/schema';
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

      const storedProjects = fixture.database.select().from(projects).all();
      expect(storedProjects).toEqual([
        expect.objectContaining({
          rootPath: '/work/codex',
          gitRemoteUrl: 'git@example.com:codex.git',
        }),
      ]);
      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          harness: 'codex',
          stableSessionId,
          projectId: storedProjects[0].id,
          logFilePath: sessionPath,
          startedAt: Date.parse('2025-01-02T20:00:00.000Z'),
          endedAt: Date.parse('2025-01-02T20:30:02.000Z'),
        }),
      ]);
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'codex-turn-1',
          harness: 'codex',
          projectId: storedProjects[0].id,
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
      const storedCheckpoint = fixture.database
        .select()
        .from(checkpoints)
        .get();
      expect(storedCheckpoint).toMatchObject({
        harness: 'codex',
        stableSessionId,
        fileSize: storedCheckpoint?.lastCompleteRecordByteOffset,
      });
      expect(resolveProject.mock.calls).toEqual([['/work/codex/subdirectory']]);

      await handler.run(null, {
        correlationId: 'codex-correlation-2',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      expect(fixture.database.select().from(interactions).all()).toHaveLength(
        1,
      );
    } finally {
      fixture.sqlite.close();
    }
  });

  it('attributes each Interaction independently and nulls a heterogeneous Session Project', async () => {
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '22222222-2222-4222-8222-222222222222';
    const sessionPath = join(
      fixture.sessionDirectory,
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
    );
    await writeCodexJsonLines(
      sessionPath,
      rolloutRecords(stableSessionId, [
        { interactionKey: 'turn-alpha', cwd: '/work/alpha/subdirectory' },
        { interactionKey: 'turn-beta', cwd: '/work/beta/subdirectory' },
      ]),
    );
    const resolveProject = vi.fn(async (cwd: string) => {
      const rootPath = cwd.startsWith('/work/alpha')
        ? '/work/alpha'
        : '/work/beta';
      return { rootPath, gitRemoteUrl: `${rootPath}.git` };
    });
    const handler = createCodexIngestHandler({ resolveProject });

    try {
      await handler.run(null, {
        correlationId: 'codex-cross-repo',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      const storedProjects = fixture.database.select().from(projects).all();
      const projectIdsByRoot = new Map(
        storedProjects.map((project) => [project.rootPath, project.id]),
      );
      expect(fixture.database.select().from(sessions).get()).toMatchObject({
        stableSessionId,
        projectId: null,
      });
      expect(
        fixture.database
          .select()
          .from(interactions)
          .all()
          .map(({ interactionKey, projectId }) => ({
            interactionKey,
            projectId,
          })),
      ).toEqual([
        {
          interactionKey: 'turn-alpha',
          projectId: projectIdsByRoot.get('/work/alpha'),
        },
        {
          interactionKey: 'turn-beta',
          projectId: projectIdsByRoot.get('/work/beta'),
        },
      ]);
      expect(resolveProject.mock.calls).toEqual([
        ['/work/alpha/subdirectory'],
        ['/work/beta/subdirectory'],
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

      const storedProject = fixture.database.select().from(projects).get();
      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          stableSessionId,
          projectId: storedProject?.id,
          logFilePath: archivedPath,
        }),
      ]);
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'turn-archived-only',
          projectId: storedProject?.id,
        }),
      ]);
      expect(fixture.database.select().from(checkpoints).all()).toEqual([
        expect.objectContaining({ harness: 'codex', stableSessionId }),
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('keeps one Session, Checkpoint and Interaction when a rollout moves to archived_sessions', async () => {
    const fixture = await createCodexIngestFixture();
    const stableSessionId = '33333333-3333-4333-8333-333333333333';
    const fileName = `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`;
    const activePath = join(fixture.sessionDirectory, fileName);
    const archivedPath = join(fixture.archivedSessionDirectory, fileName);
    await writeCodexJsonLines(
      activePath,
      rolloutRecords(stableSessionId, [
        { interactionKey: 'turn-archived', cwd: '/work/archived' },
      ]),
    );
    const handler = createCodexIngestHandler({
      resolveProject: async () => ({
        rootPath: '/work/archived',
        gitRemoteUrl: null,
      }),
    });
    const run = (correlationId: string) =>
      handler.run(null, {
        correlationId,
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

    try {
      await run('codex-active');
      const originalSession = fixture.database.select().from(sessions).get();
      const originalInteraction = fixture.database
        .select()
        .from(interactions)
        .get();
      const originalCheckpoint = fixture.database
        .select()
        .from(checkpoints)
        .get();
      await rename(activePath, archivedPath);
      await run('codex-relocated');
      await run('codex-archived-rerun');

      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          id: originalSession?.id,
          stableSessionId,
          logFilePath: archivedPath,
        }),
      ]);
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          id: originalInteraction?.id,
          interactionKey: 'turn-archived',
        }),
      ]);
      expect(fixture.database.select().from(checkpoints).all()).toEqual([
        originalCheckpoint,
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
