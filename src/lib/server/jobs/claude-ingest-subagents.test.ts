import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interactions } from '../database/schema';
import {
  createClaudeIngestHandler,
  literalCwdProjectResolver,
} from './claude-ingest';
import {
  cleanupClaudeIngestFixtures,
  createClaudeIngestFixture as createFixture,
  writeJsonLines,
} from './claude-ingest-fixture';

afterEach(cleanupClaudeIngestFixtures);

describe('Claude ingest sub-agent folding', () => {
  it('folds completed separate and inline sub-agents into their spawning Interactions', async () => {
    const fixture = await createFixture();
    const sessionId = '44444444-4444-4444-8444-444444444444';
    const sessionPath = join(fixture.projectDirectory, `${sessionId}.jsonl`);
    const subagentDirectory = join(
      fixture.projectDirectory,
      sessionId,
      'subagents',
    );
    await mkdir(subagentDirectory, { recursive: true });
    await writeJsonLines(sessionPath, [
      {
        type: 'user',
        uuid: 'separate-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-03-01T10:00:00.000Z',
        message: { content: 'Delegate separate work' },
      },
      {
        type: 'assistant',
        timestamp: '2025-03-01T10:00:01.000Z',
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { input_tokens: 2, output_tokens: 3 },
          content: [
            { type: 'tool_use', id: 'tool-root', name: 'Agent', input: {} },
          ],
        },
      },
      {
        type: 'user',
        cwd: '/work/alpha',
        timestamp: '2025-03-01T10:00:02.000Z',
        toolUseResult: { status: 'completed', agentId: 'root-agent' },
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool-root', content: [] },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'inline-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-03-01T11:00:00.000Z',
        message: { content: 'Delegate inline work' },
      },
      {
        type: 'assistant',
        timestamp: '2025-03-01T11:00:01.000Z',
        message: {
          model: 'claude-haiku-4-5-20251001',
          usage: { output_tokens: 5 },
          content: [
            { type: 'tool_use', id: 'tool-inline', name: 'Agent', input: {} },
          ],
        },
      },
      {
        type: 'assistant',
        isSidechain: true,
        agentId: 'inline-agent',
        timestamp: '2025-03-01T11:00:02.000Z',
        message: {
          model: 'discarded-inline-model',
          usage: { input_tokens: 7, cache_read_input_tokens: 9 },
          content: [
            {
              type: 'tool_use',
              id: 'tool-inline-child',
              name: 'Agent',
              input: {},
            },
          ],
        },
      },
      {
        type: 'user',
        isSidechain: true,
        agentId: 'inline-agent',
        timestamp: '2025-03-01T11:00:03.000Z',
        toolUseResult: { status: 'completed', agentId: 'inline-child' },
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-inline-child',
              content: [],
            },
          ],
        },
      },
      {
        type: 'assistant',
        isSidechain: true,
        agentId: 'inline-child',
        timestamp: '2025-03-01T11:00:04.000Z',
        message: {
          model: 'discarded-inline-child-model',
          usage: {
            output_tokens: 8,
            cache_creation_input_tokens: 6,
          },
        },
      },
      {
        type: 'user',
        cwd: '/work/alpha',
        timestamp: '2025-03-01T11:00:05.000Z',
        toolUseResult: { status: 'completed', agentId: 'inline-agent' },
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool-inline', content: [] },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'incomplete-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-03-01T12:00:00.000Z',
        message: { content: 'Launch unfinished work' },
      },
      {
        type: 'assistant',
        timestamp: '2025-03-01T12:00:01.000Z',
        message: {
          model: 'claude-opus-4-8[1m]',
          usage: { output_tokens: 1 },
          content: [
            {
              type: 'tool_use',
              id: 'tool-incomplete',
              name: 'Agent',
              input: {},
            },
            {
              type: 'tool_use',
              id: 'tool-not-agent',
              name: 'Read',
              input: {},
            },
          ],
        },
      },
      {
        type: 'user',
        cwd: '/work/alpha',
        timestamp: '2025-03-01T12:00:02.000Z',
        toolUseResult: {
          status: 'async_launched',
          agentId: 'incomplete-agent',
        },
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-incomplete',
              content: [],
            },
          ],
        },
      },
      {
        type: 'user',
        cwd: '/work/alpha',
        timestamp: '2025-03-01T12:00:03.000Z',
        toolUseResult: { status: 'completed', agentId: 'unmatched-agent' },
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-not-agent',
              content: [],
            },
          ],
        },
      },
    ]);
    await writeJsonLines(join(subagentDirectory, 'agent-root-agent.jsonl'), [
      {
        type: 'assistant',
        isSidechain: true,
        agentId: 'root-agent',
        message: {
          model: 'discarded-root-model',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 40,
          },
          content: [
            {
              type: 'tool_use',
              id: 'tool-child',
              name: 'Agent',
              input: {},
            },
          ],
        },
      },
      {
        type: 'user',
        isSidechain: true,
        agentId: 'root-agent',
        toolUseResult: { status: 'completed', agentId: 'child-agent' },
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-child',
              content: [],
            },
          ],
        },
      },
    ]);
    await writeJsonLines(join(subagentDirectory, 'agent-child-agent.jsonl'), [
      {
        type: 'assistant',
        isSidechain: true,
        agentId: 'child-agent',
        message: {
          model: 'discarded-child-model',
          usage: {
            input_tokens: 1,
            output_tokens: 2,
            cache_read_input_tokens: 3,
            cache_creation_input_tokens: 4,
          },
        },
      },
    ]);
    await writeJsonLines(
      join(subagentDirectory, 'agent-incomplete-agent.jsonl'),
      [
        {
          type: 'assistant',
          isSidechain: true,
          agentId: 'incomplete-agent',
          message: {
            model: 'discarded-incomplete-model',
            usage: {
              input_tokens: 100,
              output_tokens: 100,
              cache_read_input_tokens: 100,
              cache_creation_input_tokens: 100,
            },
          },
        },
      ],
    );
    await writeJsonLines(
      join(subagentDirectory, 'agent-unmatched-agent.jsonl'),
      [
        {
          type: 'assistant',
          isSidechain: true,
          agentId: 'unmatched-agent',
          message: {
            model: 'discarded-unmatched-model',
            usage: {
              input_tokens: 200,
              output_tokens: 200,
              cache_read_input_tokens: 200,
              cache_creation_input_tokens: 200,
            },
          },
        },
      ],
    );
    const handler = createClaudeIngestHandler({
      resolveProject: literalCwdProjectResolver,
    });

    try {
      const run = async (correlationId: string) =>
        handler.run(null, {
          correlationId,
          database: fixture.database,
          progress: vi.fn(),
          log: vi.fn(),
        });
      await run('correlation-subagents-1');

      const stored = fixture.database
        .select()
        .from(interactions)
        .orderBy(interactions.timestamp)
        .all();
      expect(stored).toHaveLength(3);
      expect(stored[0]).toMatchObject({
        interactionKey: 'separate-prompt',
        model: 'claude-sonnet-4-6',
        mainInputTokens: 2,
        mainOutputTokens: 3,
        subInputTokens: 11,
        subOutputTokens: 22,
        subCacheReadTokens: 33,
        subCacheWriteTokens: 44,
      });
      expect(stored[1]).toMatchObject({
        interactionKey: 'inline-prompt',
        model: 'claude-haiku-4-5',
        mainInputTokens: null,
        mainOutputTokens: 5,
        subInputTokens: 7,
        subOutputTokens: 8,
        subCacheReadTokens: 9,
        subCacheWriteTokens: 6,
      });
      expect(stored[2]).toMatchObject({
        interactionKey: 'incomplete-prompt',
        model: 'claude-opus-4-8',
        subInputTokens: null,
        subOutputTokens: null,
        subCacheReadTokens: null,
        subCacheWriteTokens: null,
      });

      await run('correlation-subagents-2');
      expect(
        fixture.database
          .select()
          .from(interactions)
          .orderBy(interactions.timestamp)
          .all(),
      ).toEqual(stored);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('attributes a later completion to the original spawning Interaction', async () => {
    const fixture = await createFixture();
    const sessionId = '55555555-5555-4555-8555-555555555555';
    const sessionPath = join(fixture.projectDirectory, `${sessionId}.jsonl`);
    const subagentDirectory = join(
      fixture.projectDirectory,
      sessionId,
      'subagents',
    );
    await mkdir(subagentDirectory, { recursive: true });
    await writeJsonLines(join(subagentDirectory, 'agent-late-agent.jsonl'), [
      {
        type: 'assistant',
        isSidechain: true,
        agentId: 'late-agent',
        message: {
          model: 'discarded-late-model',
          usage: {
            input_tokens: 12,
            output_tokens: 13,
            cache_read_input_tokens: 14,
            cache_creation_input_tokens: 15,
          },
        },
      },
    ]);
    const records = [
      {
        type: 'user',
        uuid: 'spawning-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-03-02T10:00:00.000Z',
        message: { content: 'Launch background work' },
      },
      {
        type: 'assistant',
        timestamp: '2025-03-02T10:00:01.000Z',
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { output_tokens: 1 },
          content: [
            { type: 'tool_use', id: 'tool-late', name: 'Agent', input: {} },
          ],
        },
      },
      {
        type: 'user',
        cwd: '/work/alpha',
        timestamp: '2025-03-02T10:00:02.000Z',
        toolUseResult: { status: 'async_launched', agentId: 'late-agent' },
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool-late', content: [] },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'later-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-03-02T11:00:00.000Z',
        message: { content: 'Do something else' },
      },
      {
        type: 'assistant',
        timestamp: '2025-03-02T11:00:01.000Z',
        message: {
          model: 'claude-haiku-4-5-20251001',
          usage: { output_tokens: 2 },
        },
      },
    ];
    await writeJsonLines(sessionPath, records);
    const handler = createClaudeIngestHandler({
      resolveProject: literalCwdProjectResolver,
    });
    const run = (correlationId: string) =>
      handler.run(null, {
        correlationId,
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

    try {
      await run('correlation-late-agent-1');
      expect(
        fixture.database
          .select()
          .from(interactions)
          .orderBy(interactions.timestamp)
          .all(),
      ).toEqual([
        expect.objectContaining({
          interactionKey: 'spawning-prompt',
          subInputTokens: null,
          subOutputTokens: null,
          subCacheReadTokens: null,
          subCacheWriteTokens: null,
        }),
        expect.objectContaining({
          interactionKey: 'later-prompt',
          subInputTokens: null,
          subOutputTokens: null,
          subCacheReadTokens: null,
          subCacheWriteTokens: null,
        }),
      ]);

      await writeJsonLines(sessionPath, [
        ...records,
        {
          type: 'user',
          cwd: '/work/alpha',
          timestamp: '2025-03-02T11:00:02.000Z',
          toolUseResult: { status: 'completed', agentId: 'late-agent' },
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'tool-late', content: [] },
            ],
          },
        },
      ]);
      await run('correlation-late-agent-2');

      const stored = fixture.database
        .select()
        .from(interactions)
        .orderBy(interactions.timestamp)
        .all();
      expect(stored[0]).toMatchObject({
        interactionKey: 'spawning-prompt',
        subInputTokens: 12,
        subOutputTokens: 13,
        subCacheReadTokens: 14,
        subCacheWriteTokens: 15,
      });
      expect(stored[1]).toMatchObject({
        interactionKey: 'later-prompt',
        subInputTokens: null,
        subOutputTokens: null,
        subCacheReadTokens: null,
        subCacheWriteTokens: null,
      });
    } finally {
      fixture.sqlite.close();
    }
  });
});
