import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interactions, sessions } from '../database/schema';
import { createOmpIngestHandler, createOmpIngestJob } from './omp-ingest';
import {
  appendOmpJsonLines,
  cleanupOmpIngestFixtures,
  createOmpIngestFixture,
  writeOmpJsonLines,
} from './omp-ingest-fixture';

const TOTALS_COLUMNS = {
  interactionKey: interactions.interactionKey,
  model: interactions.model,
  mainInputTokens: interactions.mainInputTokens,
  mainOutputTokens: interactions.mainOutputTokens,
  mainCacheReadTokens: interactions.mainCacheReadTokens,
  mainCacheWriteTokens: interactions.mainCacheWriteTokens,
};

afterEach(cleanupOmpIngestFixtures);

describe('omp ingest Job handler', () => {
  it('stores raw omp Interactions and folds nested sub-agent tokens into their spawning Interaction', async () => {
    const fixture = await createOmpIngestFixture();
    const stableSessionId = '11111111-1111-4111-8111-111111111111';
    const sessionBase = `2025-01-01T20-00-00-000Z_${stableSessionId}`;
    const sessionPath = join(fixture.projectDirectory, `${sessionBase}.jsonl`);
    const auxiliaryDirectory = join(fixture.projectDirectory, sessionBase);
    const nestedDirectory = join(auxiliaryDirectory, 'AgentOne');
    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(
      join(fixture.logSource, 'stats.db'),
      'not a SQLite database',
    );
    await writeFile(
      join(fixture.projectDirectory, 'stats.db'),
      'must never be opened',
    );

    await writeOmpJsonLines(sessionPath, [
      { type: 'title', v: 1, title: 'Raw omp fixture' },
      {
        type: 'session',
        version: 3,
        id: stableSessionId,
        timestamp: '2025-01-01T20:00:00.000Z',
        cwd: '/work/alpha/subdirectory',
      },
      {
        type: 'message',
        id: 'omp-prompt-1',
        timestamp: '2025-01-01T20:00:01.000Z',
        cwd: '/work/alpha/subdirectory',
        message: { role: 'user', content: 'Delegate this' },
      },
      {
        type: 'message',
        id: 'omp-main-answer-1',
        timestamp: '2025-01-01T20:00:02.000Z',
        message: {
          role: 'assistant',
          model: 'gpt-5.6-sol-20260701',
          usage: { input: 10, output: 5, cacheRead: 2 },
          content: [
            {
              type: 'toolCall',
              id: 'spawn-agent-one',
              name: 'task',
              arguments: { tasks: [{ name: 'AgentOne' }] },
            },
          ],
        },
      },
      {
        type: 'message',
        id: 'omp-task-result-1',
        timestamp: '2025-01-01T20:00:05.000Z',
        message: {
          role: 'toolResult',
          toolName: 'task',
          content:
            '<task-result id="AgentOne" status="completed">done</task-result>',
        },
      },
      {
        type: 'message',
        id: 'response-less-control',
        timestamp: '2025-01-01T20:10:00.000Z',
        message: { role: 'user', content: '/clear' },
      },
      {
        type: 'message',
        id: 'omp-prompt-2',
        timestamp: '2025-01-01T20:30:00.000Z',
        cwd: '/work/beta/subdirectory',
        message: { role: 'user', content: 'Finish here' },
      },
      {
        type: 'message',
        id: 'omp-main-answer-2',
        timestamp: '2025-01-01T20:30:01.000Z',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-6[1m]',
          usage: { output: 0 },
        },
      },
    ]);

    const rootAgentPath = join(auxiliaryDirectory, 'AgentOne.jsonl');
    await writeOmpJsonLines(rootAgentPath, [
      { type: 'title', v: 1, title: '' },
      {
        type: 'session',
        version: 3,
        id: 'agent-one-session',
        timestamp: '2025-01-01T20:00:03.000Z',
        cwd: '/work/alpha/subdirectory',
      },
      {
        type: 'message',
        id: 'agent-one-prompt',
        timestamp: '2025-01-01T20:00:03.100Z',
        message: { role: 'user', content: 'Assigned work' },
      },
      {
        type: 'message',
        id: 'agent-one-answer',
        timestamp: '2025-01-01T20:00:04.000Z',
        message: {
          role: 'assistant',
          model: 'gpt-5.6-sol',
          usage: { input: 3, output: 7, cacheWrite: 1 },
          content: [
            {
              type: 'toolCall',
              id: 'spawn-child',
              name: 'task',
              arguments: { tasks: [{ name: 'Child' }] },
            },
          ],
        },
      },
      {
        type: 'message',
        id: 'child-task-result',
        timestamp: '2025-01-01T20:00:04.600Z',
        message: {
          role: 'toolResult',
          toolName: 'task',
          content: [
            {
              type: 'text',
              text: '<task-result id="AgentOne.Child" status="completed">done</task-result>',
            },
          ],
        },
      },
    ]);
    const childAgentPath = join(nestedDirectory, 'AgentOne.Child.jsonl');
    await writeOmpJsonLines(childAgentPath, [
      {
        type: 'session',
        id: 'child-session',
        timestamp: '2025-01-01T20:00:04.100Z',
        cwd: '/work/alpha/subdirectory',
      },
      {
        type: 'message',
        id: 'child-answer',
        timestamp: '2025-01-01T20:00:04.500Z',
        message: {
          role: 'assistant',
          model: 'gpt-5.5',
          usage: { output: 11, cacheRead: 4 },
        },
      },
      {
        type: 'message',
        id: 'child-late-answer',
        timestamp: '2025-01-01T20:00:04.700Z',
        message: {
          role: 'assistant',
          model: 'gpt-5.5',
          usage: { output: 2 },
        },
      },
    ]);

    const resolveProject = vi.fn(async (cwd: string) => ({
      rootPath: cwd.startsWith('/work/alpha') ? '/work/alpha' : '/work/beta',
      gitRemoteUrl: null,
    }));
    const handler = createOmpIngestHandler({ resolveProject });

    try {
      await handler.run(null, {
        correlationId: 'omp-correlation-1',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          harness: 'omp',
          stableSessionId,
          logFilePath: sessionPath,
          startedAt: Date.parse('2025-01-01T20:00:00.000Z'),
          endedAt: Date.parse('2025-01-01T20:30:01.000Z'),
        }),
      ]);
      expect(fixture.database.select().from(interactions).all()).toEqual([
        expect.objectContaining({
          harness: 'omp',
          interactionKey: 'omp-prompt-1',
          model: 'gpt-5.6-sol',
          modelRaw: 'gpt-5.6-sol-20260701',
          mainInputTokens: 10,
          mainOutputTokens: 5,
          mainCacheReadTokens: 2,
          mainCacheWriteTokens: null,
          subInputTokens: 3,
          subOutputTokens: 20,
          subCacheReadTokens: 4,
          subCacheWriteTokens: 1,
          spawnedSubagents: false,
          timestamp: Date.parse('2025-01-01T20:00:01.000Z'),
        }),
        expect.objectContaining({
          interactionKey: 'omp-prompt-2',
          model: 'claude-sonnet-4-6',
          mainOutputTokens: 0,
          subInputTokens: null,
          subOutputTokens: null,
          subCacheReadTokens: null,
          subCacheWriteTokens: null,
        }),
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('rebuilds an in-flight Interaction consistently when a session grows', async () => {
    const fixture = await createOmpIngestFixture();
    const fullFixture = await createOmpIngestFixture();
    const stableSessionId = '33333333-3333-4333-8333-333333333333';
    const sessionFileName = `2025-01-01T20-00-00-000Z_${stableSessionId}.jsonl`;
    const sessionPath = join(fixture.projectDirectory, sessionFileName);
    const fullSessionPath = join(fullFixture.projectDirectory, sessionFileName);
    const initialRecords = [
      {
        type: 'session',
        version: 3,
        id: stableSessionId,
        timestamp: '2025-01-01T20:00:00.000Z',
        cwd: '/work/alpha/subdirectory',
      },
      {
        type: 'message',
        id: 'complete-prompt',
        timestamp: '2025-01-01T20:00:01.000Z',
        message: { role: 'user', content: 'Build it' },
      },
      {
        type: 'message',
        id: 'complete-assistant',
        timestamp: '2025-01-01T20:00:02.000Z',
        message: {
          role: 'assistant',
          model: 'gpt-5.6-sol-20260701',
          usage: { input: 7, output: 7 },
        },
      },
      {
        type: 'message',
        id: 'growing-prompt',
        timestamp: '2025-01-01T20:10:00.000Z',
        message: { role: 'user', content: 'Review it' },
      },
      {
        type: 'message',
        id: 'growing-assistant-1',
        timestamp: '2025-01-01T20:10:01.000Z',
        message: {
          role: 'assistant',
          model: 'claude-haiku-4-5-20251001',
          usage: { input: 10, output: 2, cacheWrite: 3 },
        },
      },
    ];
    const appendedRecords = [
      {
        type: 'message',
        id: 'growing-assistant-2',
        timestamp: '2025-01-01T20:10:02.000Z',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-6[1m]',
          usage: { output: 20, cacheRead: 5 },
        },
      },
    ];
    await writeOmpJsonLines(sessionPath, initialRecords);
    const handler = createOmpIngestHandler({
      resolveProject: async (cwd: string) => ({
        rootPath: cwd,
        gitRemoteUrl: null,
      }),
    });

    try {
      await handler.run(null, {
        correlationId: 'before-growth',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      await appendOmpJsonLines(sessionPath, appendedRecords);
      await handler.run(null, {
        correlationId: 'after-growth',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
      await writeOmpJsonLines(fullSessionPath, [
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
          model: 'gpt-5.6-sol',
          mainInputTokens: 7,
          mainOutputTokens: 7,
          mainCacheReadTokens: null,
          mainCacheWriteTokens: null,
        },
        {
          interactionKey: 'growing-prompt',
          model: 'claude-sonnet-4-6',
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

  it('exposes the omp-scoped empty-payload Job', () => {
    expect(createOmpIngestJob()).toEqual({
      identity: { type: 'ingest', scope: 'omp' },
      payload: null,
    });
  });
});
