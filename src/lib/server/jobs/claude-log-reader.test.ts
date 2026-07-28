import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interactions, sessions } from '../database/schema';
import { claudeIngestAdapter } from './claude-adapter';
import { createIngestHandler } from './ingest-pipeline';
import { literalCwdProjectResolver } from './project-resolver';
import {
  cleanupIngestFixtures,
  createIngestFixture,
  writeJsonLines,
  type IngestFixture,
} from './ingest-fixture';

let fixture: IngestFixture;

beforeEach(async () => {
  fixture = await createIngestFixture('claude');
});

afterEach(async () => {
  fixture.close();
  await cleanupIngestFixtures();
});

async function ingest() {
  const handler = createIngestHandler(claudeIngestAdapter, {
    resolveProject: literalCwdProjectResolver,
  });
  await handler.run(null, {
    correlationId: 'correlation-1',
    database: fixture.database,
    progress: vi.fn(),
    log: vi.fn(),
  });
}

/** Every stored Interaction, in the order Ingestion wrote it. */
function storedInteractions(): (typeof interactions.$inferSelect)[] {
  return fixture.database.select().from(interactions).all();
}

function storedInteractionKeys() {
  return storedInteractions().map((row) => row.interactionKey);
}

function storedInteraction(
  interactionKey: string,
): typeof interactions.$inferSelect | undefined {
  return storedInteractions().find(
    (row) => row.interactionKey === interactionKey,
  );
}

describe('Claude log grammar', () => {
  describe('a Session ingested from a Claude log', () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';

    beforeEach(async () => {
      await writeJsonLines(fixture.sessionPath(sessionId), [
        {
          type: 'system',
          uuid: 'system-1',
          cwd: '/work/alpha',
          timestamp: '2025-01-01T19:59:00.000Z',
        },
        {
          type: 'user',
          uuid: 'prompt-1',
          cwd: '/work/alpha',
          timestamp: '2025-01-01T20:00:00.000Z',
          message: { content: 'Build the tracer' },
        },
        {
          type: 'user',
          uuid: 'meta-injection',
          isMeta: true,
          cwd: '/work/alpha',
          timestamp: '2025-01-01T20:00:02.000Z',
          message: { content: 'injected instructions' },
        },
        {
          type: 'user',
          uuid: 'image-only',
          cwd: '/work/alpha',
          timestamp: '2025-01-01T20:00:04.000Z',
          message: { content: [{ type: 'image', source: {} }] },
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
          type: 'user',
          uuid: 'sidechain-prompt',
          isSidechain: true,
          cwd: '/work/alpha',
          timestamp: '2025-01-01T20:30:02.000Z',
          message: { content: 'delegated instructions' },
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
      const subagentDirectory = join(
        fixture.sessionDirectory,
        sessionId,
        'subagents',
      );
      await mkdir(subagentDirectory, { recursive: true });
      await writeJsonLines(join(subagentDirectory, 'agent-one.jsonl'), [
        {
          type: 'user',
          uuid: 'subagent-prompt',
          isSidechain: true,
          timestamp: '2025-01-01T20:00:00.000Z',
          message: { content: 'do not enumerate me' },
        },
      ]);
      await ingest();
    });

    it('stores one Interaction per responded prompt, in the order the log opened them', () => {
      expect(storedInteractionKeys()).toEqual(['prompt-1', 'prompt-2']);
    });

    it('ingests the primary log alone, treating a sibling sub-agents directory as auxiliary', () => {
      expect(fixture.database.select().from(sessions).all()).toHaveLength(1);
    });

    it('stamps each Interaction with the Harness that logged it', () => {
      expect(storedInteractions().map((row) => row.harness)).toEqual([
        'claude',
        'claude',
      ]);
    });

    it('timestamps an Interaction from the prompt that opened it', () => {
      expect(storedInteraction('prompt-1')?.timestamp).toBe(
        Date.parse('2025-01-01T20:00:00.000Z'),
      );
    });

    it('drops a user record the Harness marked as injected meta', () => {
      expect(storedInteractionKeys()).not.toContain('meta-injection');
    });

    it('drops a user record that only returns a tool result', () => {
      expect(storedInteractionKeys()).not.toContain('tool-result-1');
    });

    it('drops a user record whose content carries no text', () => {
      expect(storedInteractionKeys()).not.toContain('image-only');
    });

    it('drops a prompt logged on a sidechain', () => {
      expect(storedInteractionKeys()).not.toContain('sidechain-prompt');
    });

    it.each(['clear-command', 'abandoned-prompt'])(
      'drops a prompt no assistant answered',
      (interactionKey) => {
        expect(storedInteractionKeys()).not.toContain(interactionKey);
      },
    );

    it('resolves the Model that served an Interaction to its canonical identity', () => {
      expect(storedInteraction('prompt-1')?.model).toBe('claude-opus-4-8');
    });

    it('keeps the raw Model spelling the log used', () => {
      expect(storedInteraction('prompt-1')?.modelRaw).toBe(
        'claude-opus-4-8[1m]',
      );
    });

    it('excludes a sidechain assistant from the Models that could have served an Interaction', () => {
      expect(storedInteraction('prompt-2')?.model).toBe('claude-sonnet-4-6');
    });

    it('sums an Interaction usage across every assistant that answered it', () => {
      expect(storedInteraction('prompt-1')?.mainOutputTokens).toBe(22);
    });

    it('files each usage field the log reports under its own Token bucket', () => {
      expect(storedInteraction('prompt-1')).toMatchObject({
        mainInputTokens: 10,
        mainCacheReadTokens: 5,
        mainCacheWriteTokens: 3,
      });
    });

    it('keeps a Token bucket no assistant reported absent rather than zero', () => {
      expect(storedInteraction('prompt-2')).toMatchObject({
        mainInputTokens: 0,
        mainOutputTokens: 0,
        mainCacheReadTokens: null,
        mainCacheWriteTokens: null,
      });
    });
  });

  describe('a Session whose prompt drew rival Models', () => {
    beforeEach(async () => {
      await writeJsonLines(
        fixture.sessionPath('22222222-2222-4222-8222-222222222222'),
        [
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
        ],
      );
      await ingest();
    });

    it('stores one Interaction for the single prompt they all answered', () => {
      expect(storedInteractionKeys()).toEqual(['prompt-1']);
    });

    it('attributes the Interaction to the Model whose spellings together produced the most output Tokens', () => {
      expect(storedInteraction('prompt-1')?.model).toBe('claude-opus-4-8');
    });

    it('keeps the raw spelling that produced most of that Model output', () => {
      expect(storedInteraction('prompt-1')?.modelRaw).toBe(
        'claude-opus-4-8-20260101',
      );
    });

    it('sums the main agent usage across every rival that answered', () => {
      expect(storedInteraction('prompt-1')?.mainOutputTokens).toBe(30);
    });
  });

  describe('a Session log that breaks the grammar', () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';

    describe('on a line that is valid JSON but not a record', () => {
      let sessionPath: string;
      let ingestion: Promise<void>;

      beforeEach(async () => {
        sessionPath = fixture.sessionPath(sessionId);
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
        // Settled here so the rejection is never unhandled and neither leaf
        // races the other's Ingestion.
        ingestion = ingest();
        await ingestion.catch(() => undefined);
      });

      it('fails Ingestion, naming the file and the line', async () => {
        await expect(ingestion).rejects.toThrow(
          `Invalid Claude JSONL at ${sessionPath}:2: record is not an object`,
        );
      });

      it('stores no Interaction', () => {
        expect(storedInteractions()).toEqual([]);
      });
    });

    it('fails Ingestion on a genuine prompt with no id to key its Interaction by', async () => {
      const sessionPath = fixture.sessionPath(sessionId);
      await writeJsonLines(sessionPath, [
        {
          type: 'user',
          cwd: '/work/alpha',
          timestamp: '2025-01-01T20:00:00.000Z',
          message: { content: 'Nameless' },
        },
        {
          type: 'assistant',
          uuid: 'assistant-1',
          timestamp: '2025-01-01T20:00:10.000Z',
          message: { model: 'claude-opus-4-8', usage: { output_tokens: 4 } },
        },
      ]);

      await expect(ingest()).rejects.toThrow(
        `Genuine Claude user record has no id: ${sessionPath}`,
      );
    });

    it('fails Ingestion on a genuine prompt with no cwd to resolve its Project from', async () => {
      const sessionPath = fixture.sessionPath(sessionId);
      await writeJsonLines(sessionPath, [
        {
          type: 'user',
          uuid: 'prompt-1',
          timestamp: '2025-01-01T20:00:00.000Z',
          message: { content: 'Rootless' },
        },
        {
          type: 'assistant',
          uuid: 'assistant-1',
          timestamp: '2025-01-01T20:00:10.000Z',
          message: { model: 'claude-opus-4-8', usage: { output_tokens: 4 } },
        },
      ]);

      await expect(ingest()).rejects.toThrow(
        `Genuine Claude user record has no cwd: ${sessionPath}`,
      );
    });

    it('fails Ingestion on a genuine prompt whose timestamp cannot be read', async () => {
      const sessionPath = fixture.sessionPath(sessionId);
      await writeJsonLines(sessionPath, [
        {
          type: 'user',
          uuid: 'prompt-1',
          cwd: '/work/alpha',
          timestamp: 'the day before yesterday',
          message: { content: 'Timeless' },
        },
        {
          type: 'assistant',
          uuid: 'assistant-1',
          timestamp: '2025-01-01T20:00:10.000Z',
          message: { model: 'claude-opus-4-8', usage: { output_tokens: 4 } },
        },
      ]);

      await expect(ingest()).rejects.toThrow(
        `Genuine Claude user record has an invalid timestamp: ${sessionPath}`,
      );
    });

    it('fails Ingestion on a responded Interaction whose assistants named no Model', async () => {
      const sessionPath = fixture.sessionPath(sessionId);
      await writeJsonLines(sessionPath, [
        {
          type: 'user',
          uuid: 'prompt-1',
          cwd: '/work/alpha',
          timestamp: '2025-01-01T20:00:00.000Z',
          message: { content: 'Answered by nobody in particular' },
        },
        {
          type: 'assistant',
          uuid: 'assistant-1',
          timestamp: '2025-01-01T20:00:10.000Z',
          message: { usage: { output_tokens: 4 } },
        },
      ]);

      await expect(ingest()).rejects.toThrow(
        `Responded Claude Interaction has no model: ${sessionPath}`,
      );
    });
  });
});
