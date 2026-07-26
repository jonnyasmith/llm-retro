import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interactions } from '../database/schema';
import { claudeIngestAdapter } from './claude-adapter';
import { createIngestHandler } from './ingest-pipeline';
import { literalCwdProjectResolver } from './project-resolver';
import {
  cleanupIngestFixtures,
  createIngestFixture,
  writeJsonLines,
} from './ingest-fixture';

afterEach(cleanupIngestFixtures);

describe('Claude log grammar', () => {
  it('keeps only genuine responded prompts with canonical models and summed usage', async () => {
    const fixture = await createIngestFixture('claude');
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const sessionPath = fixture.sessionPath(sessionId);
    await writeJsonLines(sessionPath, [
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
    // A sibling subagents directory is auxiliary, never a primary session file:
    // its records must not surface as their own Interaction.
    const ignoredDirectory = join(
      fixture.sessionDirectory,
      sessionId,
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
    const handler = createIngestHandler(claudeIngestAdapter, {
      resolveProject: literalCwdProjectResolver,
    });

    try {
      await handler.run(null, {
        correlationId: 'correlation-1',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

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
    } finally {
      fixture.close();
    }
  });

  it('attributes an Interaction to one Model spelled two ways over a briefer rival', async () => {
    const fixture = await createIngestFixture('claude');
    const sessionPath = fixture.sessionPath(
      '22222222-2222-4222-8222-222222222222',
    );
    await writeJsonLines(sessionPath, [
      {
        type: 'user',
        uuid: 'prompt-1',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T20:00:00.000Z',
        message: { content: 'Split the vote' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp: '2025-01-01T20:00:10.000Z',
        message: {
          model: 'claude-opus-4-8-20260101',
          usage: { output_tokens: 10 },
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-2',
        timestamp: '2025-01-01T20:00:20.000Z',
        message: {
          model: 'claude-opus-4-8[1m]',
          usage: { output_tokens: 8 },
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-3',
        timestamp: '2025-01-01T20:00:30.000Z',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { output_tokens: 12 },
        },
      },
      {
        type: 'last-prompt',
        uuid: 'last-prompt-1',
        timestamp: '2025-01-01T20:00:40.000Z',
      },
    ]);
    const handler = createIngestHandler(claudeIngestAdapter, {
      resolveProject: literalCwdProjectResolver,
    });

    try {
      await handler.run(null, {
        correlationId: 'correlation-1',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          interactionKey: 'prompt-1',
          model: 'claude-opus-4-8',
          modelRaw: 'claude-opus-4-8-20260101',
          mainOutputTokens: 30,
        }),
      ]);
    } finally {
      fixture.close();
    }
  });

  it('fails ingestion on a session log line that is valid JSON but not a record', async () => {
    const fixture = await createIngestFixture('claude');
    const sessionPath = fixture.sessionPath(
      '33333333-3333-4333-8333-333333333333',
    );
    await writeJsonLines(sessionPath, [
      {
        type: 'user',
        uuid: 'prompt-1',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T20:00:00.000Z',
        message: { content: 'Carry a scalar' },
      },
      'a line that parses but is not a record',
      {
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp: '2025-01-01T20:00:10.000Z',
        message: {
          model: 'claude-opus-4-8',
          usage: { output_tokens: 4 },
        },
      },
    ]);
    const handler = createIngestHandler(claudeIngestAdapter, {
      resolveProject: literalCwdProjectResolver,
    });

    try {
      await expect(
        handler.run(null, {
          correlationId: 'correlation-1',
          database: fixture.database,
          progress: vi.fn(),
          log: vi.fn(),
        }),
      ).rejects.toThrow(
        `Invalid Claude JSONL at ${sessionPath}:2: record is not an object`,
      );

      expect(fixture.database.select().from(interactions).all()).toEqual([]);
    } finally {
      fixture.close();
    }
  });
});
