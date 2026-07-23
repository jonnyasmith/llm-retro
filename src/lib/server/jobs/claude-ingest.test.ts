import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkpoints,
  interactions,
  projects,
  sessions,
} from '../database/schema';
import {
  createClaudeIngestHandler,
  createClaudeIngestJob,
  literalCwdProjectResolver,
} from './claude-ingest';
import {
  cleanupClaudeIngestFixtures,
  createClaudeIngestFixture as createFixture,
  writeJsonLines,
} from './claude-ingest-fixture';

afterEach(cleanupClaudeIngestFixtures);

describe('Claude ingest Job handler', () => {
  it('stores only genuine responded Interactions with normalised usage and progress', async () => {
    const fixture = await createFixture();
    const firstSessionId = '11111111-1111-4111-8111-111111111111';
    const secondSessionId = '22222222-2222-4222-8222-222222222222';
    const firstPath = join(fixture.projectDirectory, `${firstSessionId}.jsonl`);
    const secondProjectDirectory = join(fixture.logSource, '-work-beta');
    const secondPath = join(secondProjectDirectory, `${secondSessionId}.jsonl`);
    await mkdir(secondProjectDirectory, { recursive: true });
    await writeJsonLines(firstPath, [
      {
        type: 'system',
        uuid: 'system-1',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T19:59:00.000Z',
      },
      {
        type: 'user',
        uuid: 'meta-before',
        isMeta: true,
        cwd: '/work/alpha',
        timestamp: '2025-01-01T19:59:30.000Z',
        message: { content: 'injected instructions' },
      },
      {
        type: 'user',
        uuid: 'prompt-1',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T20:00:00.000Z',
        message: { content: 'Build the tracer' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp: '2025-01-01T20:00:10.000Z',
        message: {
          model: 'claude-haiku-4-5-20251001',
          usage: {
            input_tokens: 10,
            output_tokens: 2,
            cache_creation_input_tokens: 3,
          },
        },
      },
      {
        type: 'user',
        uuid: 'tool-result-1',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T20:00:15.000Z',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' },
          ],
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-2',
        timestamp: '2025-01-01T20:00:20.000Z',
        message: {
          model: 'claude-opus-4-8[1m]',
          usage: {
            output_tokens: 20,
            cache_read_input_tokens: 5,
          },
        },
      },
      {
        type: 'attachment',
        uuid: 'attachment-1',
        timestamp: '2025-01-01T20:00:25.000Z',
      },
      {
        type: 'user',
        uuid: 'clear-command',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T20:15:00.000Z',
        message: { content: '/clear' },
      },
      {
        type: 'user',
        uuid: 'prompt-2',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T20:30:00.000Z',
        message: { content: [{ type: 'text', text: '/review' }] },
      },
      {
        type: 'assistant',
        uuid: 'sidechain-assistant',
        isSidechain: true,
        timestamp: '2025-01-01T20:30:05.000Z',
        message: {
          model: 'claude-sidechain-20250101',
          usage: { input_tokens: 100, output_tokens: 100 },
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-3',
        timestamp: '2025-01-01T20:30:10.000Z',
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      },
      {
        type: 'last-prompt',
        uuid: 'last-prompt-1',
        timestamp: '2025-01-01T20:30:20.000Z',
      },
      {
        type: 'user',
        uuid: 'abandoned-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T21:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Never answered' }] },
      },
    ]);
    await writeJsonLines(secondPath, [
      {
        type: 'user',
        uuid: 'only-tool-result',
        cwd: '/work/beta',
        timestamp: '2025-01-02T10:00:00.000Z',
        message: { content: [{ type: 'tool_result', content: 'noise' }] },
      },
    ]);
    const ignoredDirectory = join(
      fixture.projectDirectory,
      firstSessionId,
      'subagents',
    );
    await mkdir(ignoredDirectory, { recursive: true });
    await writeJsonLines(join(ignoredDirectory, 'agent-one.jsonl'), [
      {
        type: 'user',
        uuid: 'subagent-prompt',
        isSidechain: true,
        timestamp: '2025-01-01T20:00:00.000Z',
        message: { content: 'do not enumerate me' },
      },
    ]);
    const resolveProject = vi.fn(async (cwd: string) => ({
      rootPath: `/resolved${cwd}`,
      gitRemoteUrl: `git@example.com:${cwd.slice(1)}.git`,
    }));
    const handler = createClaudeIngestHandler({ resolveProject });
    const progress = vi.fn();

    try {
      await handler.run(null, {
        correlationId: 'correlation-1',
        database: fixture.database,
        progress,
        log: vi.fn(),
      });

      const storedProjects = fixture.database.select().from(projects).all();
      expect(storedProjects).toEqual([
        expect.objectContaining({
          rootPath: '/resolved/work/alpha',
          gitRemoteUrl: 'git@example.com:work/alpha.git',
        }),
      ]);
      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          harness: 'claude',
          stableSessionId: firstSessionId,
          projectId: storedProjects[0].id,
          logFilePath: firstPath,
          startedAt: Date.parse('2025-01-01T19:59:00.000Z'),
          endedAt: Date.parse('2025-01-01T21:00:00.000Z'),
        }),
        expect.objectContaining({
          harness: 'claude',
          stableSessionId: secondSessionId,
          projectId: null,
          logFilePath: secondPath,
          startedAt: Date.parse('2025-01-02T10:00:00.000Z'),
          endedAt: Date.parse('2025-01-02T10:00:00.000Z'),
        }),
      ]);
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'prompt-1',
          harness: 'claude',
          model: 'claude-opus-4-8',
          modelRaw: 'claude-opus-4-8[1m]',
          mainInputTokens: 10,
          mainOutputTokens: 22,
          mainCacheReadTokens: 5,
          mainCacheWriteTokens: 3,
          timestamp: Date.parse('2025-01-01T20:00:00.000Z'),
          localDow: 4,
          localHour: 1,
          localDate: '2025-01-02',
        }),
        expect.objectContaining({
          interactionKey: 'prompt-2',
          model: 'claude-sonnet-4-6',
          modelRaw: 'claude-sonnet-4-6-20260217',
          mainInputTokens: 0,
          mainOutputTokens: 0,
          mainCacheReadTokens: null,
          mainCacheWriteTokens: null,
        }),
      ]);
      expect(resolveProject).toHaveBeenCalledTimes(1);
      expect(progress.mock.calls).toEqual([
        [{ filesTotal: 2, filesDone: 0 }],
        [{ filesTotal: 2, filesDone: 0, currentFile: firstPath }],
        [{ filesTotal: 2, filesDone: 1 }],
        [{ filesTotal: 2, filesDone: 1, currentFile: secondPath }],
        [{ filesTotal: 2, filesDone: 2 }],
      ]);

      const [betaProject] = fixture.database
        .insert(projects)
        .values({
          rootPath: '/resolved/work/beta',
          gitRemoteUrl: 'git@example.com:work/beta.git',
        })
        .returning()
        .all();
      fixture.database
        .update(interactions)
        .set({
          projectId: betaProject.id,
          model: 'stale-model',
          modelRaw: 'stale-model-raw',
          mainOutputTokens: 999,
          timestamp: 0,
          localDow: 4,
          localHour: 0,
          localDate: '1970-01-01',
        })
        .where(eq(interactions.interactionKey, 'prompt-1'))
        .run();
      fixture.database.delete(checkpoints).run();

      await handler.run(null, {
        correlationId: 'correlation-2',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      expect(fixture.database.select().from(projects).all()).toHaveLength(2);
      expect(fixture.database.select().from(sessions).all()).toHaveLength(2);
      expect(fixture.database.select().from(interactions).all()).toHaveLength(
        2,
      );
      const refreshed = fixture.database
        .select()
        .from(interactions)
        .where(eq(interactions.interactionKey, 'prompt-1'))
        .get();
      const refreshedSession = fixture.database
        .select()
        .from(sessions)
        .where(eq(sessions.stableSessionId, firstSessionId))
        .get();
      expect(refreshed).toMatchObject({
        projectId: refreshedSession?.projectId,
        model: 'claude-opus-4-8',
        modelRaw: 'claude-opus-4-8[1m]',
        mainOutputTokens: 22,
        timestamp: Date.parse('2025-01-01T20:00:00.000Z'),
        localDow: 4,
        localHour: 1,
        localDate: '2025-01-02',
      });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('exposes the harness-scoped empty-payload Job and literal cwd resolver', async () => {
    expect(createClaudeIngestJob()).toEqual({
      identity: { type: 'ingest', scope: 'claude' },
      payload: null,
    });
    await expect(
      literalCwdProjectResolver('/deleted/project'),
    ).resolves.toEqual({
      rootPath: '/deleted/project',
      gitRemoteUrl: null,
    });
  });
});
