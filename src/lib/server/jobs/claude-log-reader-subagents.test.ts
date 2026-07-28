import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interactions } from '../database/schema';
import { claudeIngestAdapter } from './claude-adapter';
import { createIngestHandler } from './ingest-pipeline';
import { literalCwdProjectResolver } from './project-resolver';
import {
  appendJsonLines,
  cleanupIngestFixtures,
  createIngestFixture,
  writeJsonLines,
  type IngestFixture,
} from './ingest-fixture';

let fixture: IngestFixture;

beforeEach(async () => {
  fixture = await createIngestFixture('claude');
});

afterEach(() => {
  fixture.close();
});

afterEach(cleanupIngestFixtures);

const handler = createIngestHandler(claudeIngestAdapter, {
  resolveProject: literalCwdProjectResolver,
});

async function ingest(correlationId: string) {
  await handler.run(null, {
    correlationId,
    database: fixture.database,
    progress: vi.fn(),
    log: vi.fn(),
  });
}

/** Every stored Interaction, oldest first. */
function storedInteractions(): (typeof interactions.$inferSelect)[] {
  return fixture.database
    .select()
    .from(interactions)
    .orderBy(interactions.timestamp)
    .all();
}

function storedInteraction(interactionKey: string) {
  const stored = storedInteractions().find(
    (row) => row.interactionKey === interactionKey,
  );
  if (stored === undefined) {
    throw new Error(`No Interaction stored for ${interactionKey}`);
  }
  return stored;
}

/** Where Claude writes the sidechain file of each sub-agent a Session ran. */
async function createSubagentDirectory(stableSessionId: string) {
  const directory = join(
    fixture.sessionDirectory,
    stableSessionId,
    'subagents',
  );
  await mkdir(directory, { recursive: true });
  return directory;
}

/** The buckets of an Interaction that folded no sub-agent Tokens at all. */
const noSubTokens = {
  subInputTokens: null,
  subOutputTokens: null,
  subCacheReadTokens: null,
  subCacheWriteTokens: null,
};

describe('Claude sub-agent folding', () => {
  describe('a Session whose sub-agents Claude logged in separate sidechain files', () => {
    const stableSessionId = '44444444-4444-4444-8444-444444444444';
    let afterFirstIngest: (typeof interactions.$inferSelect)[];

    beforeEach(async () => {
      const subagentDirectory = await createSubagentDirectory(stableSessionId);
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
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
          uuid: 'orphan-prompt',
          cwd: '/work/alpha',
          timestamp: '2025-03-01T13:00:00.000Z',
          message: { content: 'Read a file instead' },
        },
        {
          type: 'assistant',
          timestamp: '2025-03-01T13:00:01.000Z',
          message: {
            model: 'claude-sonnet-4-6-20260217',
            usage: { output_tokens: 1 },
            content: [
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
          timestamp: '2025-03-01T13:00:02.000Z',
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
              { type: 'tool_use', id: 'tool-child', name: 'Agent', input: {} },
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
              { type: 'tool_result', tool_use_id: 'tool-child', content: [] },
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
      await ingest('correlation-subagents-1');
      afterFirstIngest = storedInteractions();
    });

    it('stores one Interaction per genuine prompt, oldest first', () => {
      expect(storedInteractions().map((row) => row.interactionKey)).toEqual([
        'separate-prompt',
        'incomplete-prompt',
        'orphan-prompt',
      ]);
    });

    describe('the Interaction whose Agent call completed', () => {
      it('folds the Tokens of every sub-agent beneath it into its sub buckets', () => {
        expect(storedInteraction('separate-prompt')).toMatchObject({
          subInputTokens: 11,
          subOutputTokens: 22,
          subCacheReadTokens: 33,
          subCacheWriteTokens: 44,
        });
      });

      it('keeps its main buckets holding only what its own assistant spent', () => {
        expect(storedInteraction('separate-prompt')).toMatchObject({
          mainInputTokens: 2,
          mainOutputTokens: 3,
        });
      });

      it('is served by the Model its own assistant named, not by a sub-agent Model', () => {
        expect(storedInteraction('separate-prompt').model).toBe(
          'claude-sonnet-4-6',
        );
      });

      it('is not flagged as having sub-agent usage the Harness left unlogged', () => {
        expect(storedInteraction('separate-prompt').spawnedSubagents).toBe(
          false,
        );
      });
    });

    describe('the Interaction whose Agent call has not completed', () => {
      it('folds nothing the launched sub-agent has already spent into its sub buckets', () => {
        expect(storedInteraction('incomplete-prompt')).toMatchObject(
          noSubTokens,
        );
      });

      it('is served by the Model its own assistant named, not by the launched sub-agent Model', () => {
        expect(storedInteraction('incomplete-prompt').model).toBe(
          'claude-opus-4-8',
        );
      });
    });

    describe('the Interaction whose completed tool call was not an Agent call', () => {
      it('folds the sub-agent that completion names into no sub buckets', () => {
        expect(storedInteraction('orphan-prompt')).toMatchObject(noSubTokens);
      });
    });

    describe('and ingested a second time with the Session unchanged', () => {
      beforeEach(async () => {
        await ingest('correlation-subagents-2');
      });

      it('leaves every stored Interaction exactly as it was', () => {
        expect(storedInteractions()).toEqual(afterFirstIngest);
      });
    });
  });

  describe('a Session whose sub-agents Claude logged inline as sidechain records', () => {
    const stableSessionId = '66666666-6666-4666-8666-666666666666';

    beforeEach(async () => {
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
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
            usage: { output_tokens: 8, cache_creation_input_tokens: 6 },
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
      ]);
      await ingest('correlation-inline-subagents');
    });

    it('opens an Interaction for the genuine prompt alone, never for a sidechain record', () => {
      expect(storedInteractions().map((row) => row.interactionKey)).toEqual([
        'inline-prompt',
      ]);
    });

    it('folds the Tokens of every sub-agent beneath it into the spawning Interaction', () => {
      expect(storedInteraction('inline-prompt')).toMatchObject({
        subInputTokens: 7,
        subOutputTokens: 8,
        subCacheReadTokens: 9,
        subCacheWriteTokens: 6,
      });
    });

    it('keeps the spawning Interaction main buckets holding only what its own assistant spent', () => {
      expect(storedInteraction('inline-prompt')).toMatchObject({
        mainInputTokens: null,
        mainOutputTokens: 5,
      });
    });

    it('serves the spawning Interaction with the Model its own assistant named, not a sidechain Model', () => {
      expect(storedInteraction('inline-prompt').model).toBe('claude-haiku-4-5');
    });

    it('does not flag the spawning Interaction as having sub-agent usage the Harness left unlogged', () => {
      expect(storedInteraction('inline-prompt').spawnedSubagents).toBe(false);
    });
  });

  describe('a Session whose completed sub-agent logged no Token usage', () => {
    const stableSessionId = '77777777-7777-4777-8777-777777777777';

    beforeEach(async () => {
      const subagentDirectory = await createSubagentDirectory(stableSessionId);
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        {
          type: 'user',
          uuid: 'silent-prompt',
          cwd: '/work/alpha',
          timestamp: '2025-03-01T14:00:00.000Z',
          message: { content: 'Delegate quiet work' },
        },
        {
          type: 'assistant',
          timestamp: '2025-03-01T14:00:01.000Z',
          message: {
            model: 'claude-sonnet-4-6-20260217',
            usage: { output_tokens: 4 },
            content: [
              { type: 'tool_use', id: 'tool-silent', name: 'Agent', input: {} },
            ],
          },
        },
        {
          type: 'user',
          cwd: '/work/alpha',
          timestamp: '2025-03-01T14:00:02.000Z',
          toolUseResult: { status: 'completed', agentId: 'silent-agent' },
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'tool-silent', content: [] },
            ],
          },
        },
      ]);
      await writeJsonLines(
        join(subagentDirectory, 'agent-silent-agent.jsonl'),
        [
          {
            type: 'assistant',
            isSidechain: true,
            agentId: 'silent-agent',
            message: { model: 'discarded-silent-model' },
          },
        ],
      );
      await ingest('correlation-silent-subagent');
    });

    it('leaves the spawning Interaction sub buckets empty rather than zero', () => {
      expect(storedInteraction('silent-prompt')).toMatchObject(noSubTokens);
    });

    it('keeps the spawning Interaction main buckets holding what its own assistant spent', () => {
      expect(storedInteraction('silent-prompt')).toMatchObject({
        mainOutputTokens: 4,
      });
    });
  });

  describe('a Session ingested while its sub-agent was still running', () => {
    const stableSessionId = '55555555-5555-4555-8555-555555555555';

    beforeEach(async () => {
      const subagentDirectory = await createSubagentDirectory(stableSessionId);
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
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
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
      ]);
      await ingest('correlation-late-agent-1');
    });

    it('stores one Interaction per genuine prompt, oldest first', () => {
      expect(storedInteractions().map((row) => row.interactionKey)).toEqual([
        'spawning-prompt',
        'later-prompt',
      ]);
    });

    it('leaves the spawning Interaction sub buckets empty until the sub-agent completes', () => {
      expect(storedInteraction('spawning-prompt')).toMatchObject(noSubTokens);
    });

    it('leaves the Interaction that followed it with empty sub buckets', () => {
      expect(storedInteraction('later-prompt')).toMatchObject(noSubTokens);
    });

    describe('and ingested again once that sub-agent has completed', () => {
      beforeEach(async () => {
        await appendJsonLines(fixture.sessionPath(stableSessionId), [
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
        await ingest('correlation-late-agent-2');
      });

      it('folds the sub-agent Tokens into the Interaction that spawned it', () => {
        expect(storedInteraction('spawning-prompt')).toMatchObject({
          subInputTokens: 12,
          subOutputTokens: 13,
          subCacheReadTokens: 14,
          subCacheWriteTokens: 15,
        });
      });

      it('folds nothing into the Interaction that was open when the completion arrived', () => {
        expect(storedInteraction('later-prompt')).toMatchObject(noSubTokens);
      });
    });
  });
});
