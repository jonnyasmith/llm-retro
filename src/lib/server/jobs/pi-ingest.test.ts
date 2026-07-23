import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interactions, sessions } from '../database/schema';
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
  it('stores genuine responded Interactions with pi models, tokens, and subagent disclosure', async () => {
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
    const handler = createPiIngestHandler({
      resolveProject: literalCwdProjectResolver,
    });

    try {
      await handler.run(null, {
        correlationId: 'pi-correlation-1',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

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
          model: 'gpt-5.4',
          modelRaw: 'gpt-5.4-20260217',
          mainInputTokens: null,
          mainOutputTokens: 0,
          mainCacheReadTokens: null,
          mainCacheWriteTokens: null,
          spawnedSubagents: false,
        }),
      ]);
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
