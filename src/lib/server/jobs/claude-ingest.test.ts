import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interactions } from '../database/schema';
import { claudeIngestAdapter } from './claude-adapter';
import { createIngestHandler } from './ingest-pipeline';
import { literalCwdProjectResolver } from './project-resolver';
import {
  appendJsonLines,
  cleanupClaudeIngestFixtures,
  createClaudeIngestFixture as createFixture,
  writeJsonLines,
} from './claude-ingest-fixture';

const TOTALS_COLUMNS = {
  interactionKey: interactions.interactionKey,
  model: interactions.model,
  mainInputTokens: interactions.mainInputTokens,
  mainOutputTokens: interactions.mainOutputTokens,
  mainCacheReadTokens: interactions.mainCacheReadTokens,
  mainCacheWriteTokens: interactions.mainCacheWriteTokens,
};

afterEach(cleanupClaudeIngestFixtures);

describe('Claude ingest parsing', () => {
  it('keeps only genuine responded prompts with canonical models and summed usage', async () => {
    const fixture = await createFixture();
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const sessionPath = join(fixture.projectDirectory, `${sessionId}.jsonl`);
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
      fixture.projectDirectory,
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
      fixture.sqlite.close();
    }
  });

  it('rebuilds an in-flight Interaction consistently when a session grows', async () => {
    const fixture = await createFixture();
    const fullFixture = await createFixture();
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const sessionPath = join(fixture.projectDirectory, `${sessionId}.jsonl`);
    const fullSessionPath = join(
      fullFixture.projectDirectory,
      `${sessionId}.jsonl`,
    );
    const initialRecords = [
      {
        type: 'system',
        uuid: 'system-1',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T19:59:00.000Z',
      },
      {
        type: 'user',
        uuid: 'complete-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T20:00:00.000Z',
        message: { content: 'Build the tracer' },
      },
      {
        type: 'assistant',
        uuid: 'complete-assistant',
        timestamp: '2025-01-01T20:00:10.000Z',
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { input_tokens: 7, output_tokens: 7 },
        },
      },
      {
        type: 'user',
        uuid: 'growing-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-01-01T20:10:00.000Z',
        message: { content: 'Review it' },
      },
      {
        type: 'assistant',
        uuid: 'growing-assistant-1',
        timestamp: '2025-01-01T20:10:10.000Z',
        message: {
          model: 'claude-haiku-4-5-20251001',
          usage: {
            input_tokens: 10,
            output_tokens: 2,
            cache_creation_input_tokens: 3,
          },
        },
      },
    ];
    const appendedRecords = [
      {
        type: 'assistant',
        uuid: 'growing-assistant-2',
        timestamp: '2025-01-01T20:10:20.000Z',
        message: {
          model: 'claude-opus-4-8[1m]',
          usage: { output_tokens: 20, cache_read_input_tokens: 5 },
        },
      },
    ];
    await writeJsonLines(sessionPath, initialRecords);
    const handler = createIngestHandler(claudeIngestAdapter, {
      resolveProject: literalCwdProjectResolver,
    });

    try {
      await handler.run(null, {
        correlationId: 'before-growth',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      await appendJsonLines(sessionPath, appendedRecords);
      await handler.run(null, {
        correlationId: 'after-growth',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      await writeJsonLines(fullSessionPath, [
        ...initialRecords,
        ...appendedRecords,
      ]);
      await handler.run(null, {
        correlationId: 'full-ingest',
        database: fullFixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      const resumedTotals = fixture.database
        .select(TOTALS_COLUMNS)
        .from(interactions)
        .all();
      expect(resumedTotals).toEqual(
        fullFixture.database.select(TOTALS_COLUMNS).from(interactions).all(),
      );
      expect(resumedTotals).toEqual([
        {
          interactionKey: 'complete-prompt',
          model: 'claude-sonnet-4-6',
          mainInputTokens: 7,
          mainOutputTokens: 7,
          mainCacheReadTokens: null,
          mainCacheWriteTokens: null,
        },
        {
          interactionKey: 'growing-prompt',
          model: 'claude-opus-4-8',
          mainInputTokens: 10,
          mainOutputTokens: 22,
          mainCacheReadTokens: 5,
          mainCacheWriteTokens: 3,
        },
      ]);
    } finally {
      fixture.sqlite.close();
      fullFixture.sqlite.close();
    }
  });
});
