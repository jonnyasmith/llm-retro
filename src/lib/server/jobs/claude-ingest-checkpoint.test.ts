import { appendFile, mkdir, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkpoints, interactions } from '../database/schema';
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

const line = (record: unknown) => `${JSON.stringify(record)}\n`;

describe('Claude ingest Checkpoint resumption', () => {
  it('defers partial records, skips unchanged bytes, resumes growth, and rereads sub-agents', async () => {
    const fixture = await createFixture();
    const sessionId = '66666666-6666-4666-8666-666666666666';
    const sessionPath = join(fixture.projectDirectory, `${sessionId}.jsonl`);
    const firstRecords = [
      {
        type: 'system',
        cwd: '/work/alpha',
        timestamp: '2025-04-01T09:59:00.000Z',
      },
      {
        type: 'user',
        uuid: 'checkpoint-prompt-1',
        cwd: '/work/alpha',
        timestamp: '2025-04-01T10:00:00.000Z',
        message: { content: 'First complete Interaction' },
      },
      {
        type: 'assistant',
        timestamp: '2025-04-01T10:00:01.000Z',
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { output_tokens: 1 },
        },
      },
    ];
    const deferredPrompt = {
      type: 'user',
      uuid: 'checkpoint-prompt-2',
      cwd: '/work/alpha',
      timestamp: '2025-04-01T11:00:00.000Z',
      message: { content: 'Deferred until its line is complete' },
    };
    const completePrefix = firstRecords.map(line).join('');
    await writeFile(
      sessionPath,
      completePrefix + JSON.stringify(deferredPrompt),
    );
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
      await run('checkpoint-first');
      const initialState = await stat(sessionPath);
      expect(fixture.database.select().from(interactions).all()).toMatchObject([
        {
          interactionKey: 'checkpoint-prompt-1',
          model: 'claude-sonnet-4-6',
        },
      ]);
      expect(fixture.database.select().from(checkpoints).all()).toEqual([
        {
          harness: 'claude',
          stableSessionId: sessionId,
          lastCompleteRecordByteOffset: Buffer.byteLength(completePrefix),
          fileSize: initialState.size,
          fileMtime: Math.trunc(initialState.mtimeMs),
        },
      ]);

      fixture.database
        .update(interactions)
        .set({ model: 'unchanged-skip-sentinel' })
        .where(eq(interactions.interactionKey, 'checkpoint-prompt-1'))
        .run();
      await run('checkpoint-unchanged');
      expect(
        fixture.database
          .select({ model: interactions.model })
          .from(interactions)
          .where(eq(interactions.interactionKey, 'checkpoint-prompt-1'))
          .get(),
      ).toEqual({ model: 'unchanged-skip-sentinel' });

      const secondAssistant = {
        type: 'assistant',
        timestamp: '2025-04-01T11:00:01.000Z',
        message: {
          model: 'claude-opus-4-8[1m]',
          usage: { input_tokens: 2, output_tokens: 3 },
          content: [{ type: 'tool_use', id: 'tool-checkpoint', name: 'Agent' }],
        },
      };
      const completedAgent = {
        type: 'user',
        cwd: '/work/alpha',
        timestamp: '2025-04-01T11:00:02.000Z',
        toolUseResult: { status: 'completed', agentId: 'checkpoint-agent' },
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-checkpoint',
              content: [],
            },
          ],
        },
      };
      await appendFile(
        sessionPath,
        `\n${line(secondAssistant)}${line(completedAgent)}`,
      );
      await utimes(
        sessionPath,
        initialState.atime,
        new Date(initialState.mtimeMs + 2_000),
      );
      await run('checkpoint-growth');

      const afterGrowth = await stat(sessionPath);
      const storedAfterGrowth = fixture.database
        .select()
        .from(interactions)
        .orderBy(interactions.timestamp)
        .all();
      expect(storedAfterGrowth).toHaveLength(2);
      expect(storedAfterGrowth[0]).toMatchObject({
        interactionKey: 'checkpoint-prompt-1',
        model: 'unchanged-skip-sentinel',
      });
      expect(storedAfterGrowth[1]).toMatchObject({
        interactionKey: 'checkpoint-prompt-2',
        model: 'claude-opus-4-8',
        mainInputTokens: 2,
        mainOutputTokens: 3,
        subInputTokens: null,
      });
      expect(fixture.database.select().from(checkpoints).all()).toEqual([
        {
          harness: 'claude',
          stableSessionId: sessionId,
          lastCompleteRecordByteOffset: afterGrowth.size,
          fileSize: afterGrowth.size,
          fileMtime: Math.trunc(afterGrowth.mtimeMs),
        },
      ]);

      const subagentDirectory = join(
        fixture.projectDirectory,
        sessionId,
        'subagents',
      );
      await mkdir(subagentDirectory, { recursive: true });
      await writeJsonLines(
        join(subagentDirectory, 'agent-checkpoint-agent.jsonl'),
        [
          {
            type: 'assistant',
            isSidechain: true,
            agentId: 'checkpoint-agent',
            message: {
              model: 'discarded-subagent-model',
              usage: {
                input_tokens: 5,
                output_tokens: 6,
                cache_read_input_tokens: 7,
                cache_creation_input_tokens: 8,
              },
            },
          },
        ],
      );
      await run('checkpoint-subagent-reread');

      expect(
        fixture.database
          .select()
          .from(interactions)
          .where(eq(interactions.interactionKey, 'checkpoint-prompt-2'))
          .get(),
      ).toMatchObject({
        subInputTokens: 5,
        subOutputTokens: 6,
        subCacheReadTokens: 7,
        subCacheWriteTokens: 8,
      });
      expect(fixture.database.select().from(checkpoints).all()).toHaveLength(1);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('recovers only the open Interaction context when growth starts with an assistant', async () => {
    const fixture = await createFixture();
    const sessionId = '77777777-7777-4777-8777-777777777777';
    const sessionPath = join(fixture.projectDirectory, `${sessionId}.jsonl`);
    await writeJsonLines(sessionPath, [
      {
        type: 'user',
        uuid: 'continued-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-04-02T10:00:00.000Z',
        message: { content: 'Continue responding after the first ingest' },
      },
      {
        type: 'assistant',
        timestamp: '2025-04-02T10:00:01.000Z',
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { output_tokens: 2 },
        },
      },
    ]);
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
      await run('continued-first');
      const initialState = await stat(sessionPath);
      await appendFile(
        sessionPath,
        line({
          type: 'assistant',
          timestamp: '2025-04-02T10:00:02.000Z',
          message: {
            model: 'claude-sonnet-4-6-20260217',
            usage: { output_tokens: 3 },
          },
        }),
      );
      await utimes(
        sessionPath,
        initialState.atime,
        new Date(initialState.mtimeMs + 2_000),
      );
      await run('continued-growth');

      expect(fixture.database.select().from(interactions).all()).toMatchObject([
        {
          interactionKey: 'continued-prompt',
          mainOutputTokens: 5,
        },
      ]);
      const grownState = await stat(sessionPath);
      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        stableSessionId: sessionId,
        lastCompleteRecordByteOffset: grownState.size,
        fileSize: grownState.size,
      });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('recovers inline sub-agent context when completion arrives after the checkpoint', async () => {
    const fixture = await createFixture();
    const sessionId = '88888888-8888-4888-8888-888888888888';
    const sessionPath = join(fixture.projectDirectory, `${sessionId}.jsonl`);
    await writeJsonLines(sessionPath, [
      {
        type: 'user',
        uuid: 'inline-resume-prompt',
        cwd: '/work/alpha',
        timestamp: '2025-04-03T10:00:00.000Z',
        message: { content: 'Launch inline work' },
      },
      {
        type: 'assistant',
        timestamp: '2025-04-03T10:00:01.000Z',
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { output_tokens: 1 },
          content: [{ type: 'tool_use', id: 'inline-tool', name: 'Agent' }],
        },
      },
      {
        type: 'user',
        timestamp: '2025-04-03T10:00:02.000Z',
        toolUseResult: { status: 'async_launched', agentId: 'inline-agent' },
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'inline-tool', content: [] },
          ],
        },
      },
    ]);
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
      await run('inline-resume-first');
      const initialState = await stat(sessionPath);
      await appendFile(
        sessionPath,
        [
          {
            type: 'assistant',
            isSidechain: true,
            agentId: 'inline-agent',
            timestamp: '2025-04-03T10:00:03.000Z',
            message: {
              model: 'discarded-inline-model',
              usage: {
                input_tokens: 4,
                output_tokens: 5,
                cache_read_input_tokens: 6,
                cache_creation_input_tokens: 7,
              },
            },
          },
          {
            type: 'user',
            timestamp: '2025-04-03T10:00:04.000Z',
            toolUseResult: { status: 'completed', agentId: 'inline-agent' },
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'inline-tool',
                  content: [],
                },
              ],
            },
          },
        ]
          .map(line)
          .join(''),
      );
      await utimes(
        sessionPath,
        initialState.atime,
        new Date(initialState.mtimeMs + 2_000),
      );
      await run('inline-resume-growth');

      expect(fixture.database.select().from(interactions).get()).toMatchObject({
        interactionKey: 'inline-resume-prompt',
        subInputTokens: 4,
        subOutputTokens: 5,
        subCacheReadTokens: 6,
        subCacheWriteTokens: 7,
      });
      const grownState = await stat(sessionPath);
      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        lastCompleteRecordByteOffset: grownState.size,
        fileSize: grownState.size,
      });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('atomically replaces obsolete Interactions when the primary file resets', async () => {
    const fixture = await createFixture();
    const sessionId = '99999999-9999-4999-8999-999999999999';
    const sessionPath = join(fixture.projectDirectory, `${sessionId}.jsonl`);
    const interaction = (id: string, timestamp: string) => [
      {
        type: 'user',
        uuid: id,
        cwd: '/work/alpha',
        timestamp,
        message: { content: id },
      },
      {
        type: 'assistant',
        timestamp,
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { output_tokens: 1 },
        },
      },
    ];
    await writeJsonLines(sessionPath, [
      ...interaction('obsolete-prompt-1', '2025-04-04T10:00:00.000Z'),
      ...interaction('obsolete-prompt-2', '2025-04-04T11:00:00.000Z'),
    ]);
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
      await run('replacement-first');
      const initialState = await stat(sessionPath);
      await writeJsonLines(
        sessionPath,
        interaction('replacement-prompt', '2025-04-05T10:00:00.000Z'),
      );
      await utimes(
        sessionPath,
        initialState.atime,
        new Date(initialState.mtimeMs + 2_000),
      );
      await run('replacement-second');

      expect(fixture.database.select().from(interactions).all()).toMatchObject([
        { interactionKey: 'replacement-prompt' },
      ]);
      const replacementState = await stat(sessionPath);
      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        lastCompleteRecordByteOffset: replacementState.size,
        fileSize: replacementState.size,
      });
    } finally {
      fixture.sqlite.close();
    }
  });
});
