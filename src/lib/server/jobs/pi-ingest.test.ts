import { appendFile } from 'node:fs/promises';
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
  createPiIngestHandler,
  createPiIngestJob,
  literalCwdProjectResolver,
} from './pi-ingest';
import {
  cleanupPiIngestFixtures,
  createPiIngestFixture,
  writePiJsonLines,
} from './pi-ingest-fixture';

afterEach(cleanupPiIngestFixtures);

describe('pi ingest Job handler', () => {
  it('stores genuine responded Interactions with pi models, tokens, Projects, and subagent disclosure', async () => {
    const fixture = await createPiIngestFixture();
    const stableSessionId = '11111111-1111-4111-8111-111111111111';
    const sessionPath = join(
      fixture.projectDirectory,
      `2025-01-01T20-00-00-000Z_${stableSessionId}.jsonl`,
    );
    await writePiJsonLines(sessionPath, [
      {
        type: 'session',
        version: 3,
        id: stableSessionId,
        timestamp: '2025-01-01T20:00:00.000Z',
        cwd: '/work/alpha/subdirectory',
      },
      {
        type: 'model_change',
        id: 'model-event-1',
        timestamp: '2025-01-01T20:00:01.000Z',
        modelId: 'wrong-ui-model',
      },
      {
        type: 'message',
        id: 'pi-prompt-1',
        timestamp: '2025-01-01T20:00:02.000Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Build it' }],
        },
      },
      {
        type: 'message',
        id: 'pi-assistant-1',
        timestamp: '2025-01-01T20:00:03.000Z',
        message: {
          role: 'assistant',
          model: 'claude-haiku-4-5-20251001',
          usage: { input: 10, output: 2, cacheWrite: 3 },
          content: [{ type: 'text', text: 'Starting' }],
        },
      },
      {
        type: 'message',
        id: 'pi-tool-result-no-boundary',
        timestamp: '2025-01-01T20:00:04.000Z',
        message: {
          role: 'toolResult',
          toolName: 'read',
          content: [{ type: 'text', text: 'contents' }],
        },
      },
      {
        type: 'message',
        id: 'pi-assistant-2',
        timestamp: '2025-01-01T20:00:05.000Z',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-8[1m]',
          usage: { output: 20, cacheRead: 5 },
          content: [
            {
              type: 'toolCall',
              id: 'subagent-call',
              name: 'subagent',
              arguments: { task: 'Inspect the code' },
            },
          ],
        },
      },
      {
        type: 'message',
        id: 'pi-subagent-result',
        timestamp: '2025-01-01T20:00:06.000Z',
        message: {
          role: 'toolResult',
          toolName: 'subagent',
          content: [{ type: 'text', text: 'Done' }],
        },
      },
      {
        type: 'model_change',
        id: 'model-event-2',
        timestamp: '2025-01-01T20:00:07.000Z',
        modelId: 'another-wrong-ui-model',
      },
      {
        type: 'message',
        id: 'response-less-prompt',
        timestamp: '2025-01-01T20:10:00.000Z',
        message: { role: 'user', content: '/clear' },
      },
      {
        type: 'message',
        id: 'pi-prompt-2',
        timestamp: '2025-01-01T20:30:00.000Z',
        cwd: '/work/alpha/other-subdirectory',
        message: { role: 'user', content: 'Review it' },
      },
      {
        type: 'message',
        id: 'pi-assistant-3',
        timestamp: '2025-01-01T20:30:01.000Z',
        message: {
          role: 'assistant',
          model: 'gpt-5.4-20260217',
          usage: { output: 0 },
          content: [{ type: 'text', text: 'Done' }],
        },
      },
    ]);
    const resolveProject = vi.fn(async () => ({
      rootPath: '/work/alpha',
      gitRemoteUrl: 'git@example.com:alpha.git',
    }));
    const handler = createPiIngestHandler({ resolveProject });
    const progress = vi.fn();

    try {
      await handler.run(null, {
        correlationId: 'pi-correlation-1',
        database: fixture.database,
        progress,
        log: vi.fn(),
      });

      const storedProjects = fixture.database.select().from(projects).all();
      expect(storedProjects).toEqual([
        expect.objectContaining({
          rootPath: '/work/alpha',
          gitRemoteUrl: 'git@example.com:alpha.git',
        }),
      ]);
      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          harness: 'pi',
          stableSessionId,
          logFilePath: sessionPath,
          startedAt: Date.parse('2025-01-01T20:00:00.000Z'),
          endedAt: Date.parse('2025-01-01T20:30:01.000Z'),
        }),
      ]);
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'pi-prompt-1',
          harness: 'pi',
          projectId: storedProjects[0].id,
          model: 'claude-opus-4-8',
          modelRaw: 'claude-opus-4-8[1m]',
          mainInputTokens: 10,
          mainOutputTokens: 22,
          mainCacheReadTokens: 5,
          mainCacheWriteTokens: 3,
          subInputTokens: null,
          subOutputTokens: null,
          subCacheReadTokens: null,
          subCacheWriteTokens: null,
          spawnedSubagents: true,
          timestamp: Date.parse('2025-01-01T20:00:02.000Z'),
          localDow: 4,
          localHour: 1,
          localDate: '2025-01-02',
        }),
        expect.objectContaining({
          interactionKey: 'pi-prompt-2',
          projectId: storedProjects[0].id,
          model: 'gpt-5.4',
          modelRaw: 'gpt-5.4-20260217',
          mainInputTokens: null,
          mainOutputTokens: 0,
          mainCacheReadTokens: null,
          mainCacheWriteTokens: null,
          spawnedSubagents: false,
        }),
      ]);
      const storedCheckpoint = fixture.database
        .select()
        .from(checkpoints)
        .get();
      expect(storedCheckpoint).toMatchObject({
        harness: 'pi',
        stableSessionId,
        fileSize: storedCheckpoint?.lastCompleteRecordByteOffset,
      });
      expect(resolveProject).toHaveBeenCalledTimes(2);
      expect(resolveProject.mock.calls).toEqual([
        ['/work/alpha/subdirectory'],
        ['/work/alpha/other-subdirectory'],
      ]);
      expect(progress.mock.calls).toEqual([
        [{ filesTotal: 1, filesDone: 0 }],
        [{ filesTotal: 1, filesDone: 0, currentFile: sessionPath }],
        [{ filesTotal: 1, filesDone: 1 }],
      ]);

      await handler.run(null, {
        correlationId: 'pi-correlation-2',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      expect(fixture.database.select().from(interactions).all()).toHaveLength(
        2,
      );
    } finally {
      fixture.sqlite.close();
    }
  });

  it('resumes from the checkpoint and keeps a prompt open across file growth', async () => {
    const fixture = await createPiIngestFixture();
    const stableSessionId = '22222222-2222-4222-8222-222222222222';
    const sessionPath = join(
      fixture.projectDirectory,
      `2025-01-01T20-00-00-000Z_${stableSessionId}.jsonl`,
    );
    await writePiJsonLines(sessionPath, [
      {
        type: 'session',
        id: stableSessionId,
        timestamp: '2025-01-01T20:00:00.000Z',
        cwd: '/work/alpha',
      },
      {
        type: 'message',
        id: 'pi-complete-prompt',
        timestamp: '2025-01-01T20:00:01.000Z',
        message: { role: 'user', content: 'Complete' },
      },
      {
        type: 'message',
        id: 'pi-complete-answer',
        timestamp: '2025-01-01T20:00:02.000Z',
        message: {
          role: 'assistant',
          model: 'gpt-5.4',
          usage: { input: 1, output: 2 },
        },
      },
      {
        type: 'message',
        id: 'pi-open-prompt',
        timestamp: '2025-01-01T20:00:03.000Z',
        message: { role: 'user', content: 'Answer later' },
      },
    ]);
    const handler = createPiIngestHandler({
      resolveProject: literalCwdProjectResolver,
    });

    try {
      const run = (correlationId: string) =>
        handler.run(null, {
          correlationId,
          database: fixture.database,
          progress: vi.fn(),
          log: vi.fn(),
        });
      await run('pi-growth-1');
      expect(fixture.database.select().from(interactions).all()).toHaveLength(
        1,
      );
      fixture.database
        .update(interactions)
        .set({ model: 'resume-sentinel' })
        .where(eq(interactions.interactionKey, 'pi-complete-prompt'))
        .run();

      await appendFile(
        sessionPath,
        `${JSON.stringify({
          type: 'message',
          id: 'pi-late-answer',
          timestamp: '2025-01-01T20:00:04.000Z',
          message: {
            role: 'assistant',
            model: 'claude-sonnet-4-6',
            usage: { output: 7 },
          },
        })}\n`,
      );
      await run('pi-growth-2');

      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'pi-complete-prompt',
          model: 'resume-sentinel',
        }),
        expect.objectContaining({
          interactionKey: 'pi-open-prompt',
          model: 'claude-sonnet-4-6',
          mainOutputTokens: 7,
        }),
      ]);
      const checkpoint = fixture.database.select().from(checkpoints).get();
      expect(checkpoint?.fileSize).toBeGreaterThan(0);
      expect(checkpoint?.lastCompleteRecordByteOffset).toBe(
        checkpoint?.fileSize,
      );
    } finally {
      fixture.sqlite.close();
    }
  });

  it('exposes the pi-scoped empty-payload Job', () => {
    expect(createPiIngestJob()).toEqual({
      identity: { type: 'ingest', scope: 'pi' },
      payload: null,
    });
  });
});
