import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interactions, projects, sessions } from '../database/schema';
import { createIngestHandler } from './ingest-pipeline';
import { piIngestAdapter } from './pi-adapter';
import { literalCwdProjectResolver } from './project-resolver';
import {
  cleanupIngestFixtures,
  createIngestFixture,
  writeJsonLines,
  type IngestFixture,
} from './ingest-fixture';

const stableSessionId = '11111111-1111-4111-8111-111111111111';
const sessionCwd = '/work/alpha/subdirectory';
const promptCwd = '/work/alpha/other-subdirectory';

/**
 * One pi Session exercising the whole grammar: a prompt two Models answered
 * around records the grammar ignores, a prompt nothing answered, and a prompt
 * one Model answered from a working directory of its own.
 */
const sessionRecords = [
  {
    type: 'session',
    version: 3,
    id: stableSessionId,
    timestamp: '2025-01-01T20:00:00.000Z',
    cwd: sessionCwd,
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
    cwd: promptCwd,
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
];

/** Records the grammar reads but which open no Interaction of their own. */
const recordsThatAreNotPrompts = [
  'model-event-1',
  'pi-assistant-1',
  'pi-tool-result-no-boundary',
  'pi-subagent-result',
  'model-event-2',
  'pi-assistant-3',
];

const servingModels = [
  { interactionKey: 'pi-prompt-1', model: 'claude-opus-4-8' },
  { interactionKey: 'pi-prompt-2', model: 'gpt-5.4' },
];

const promptMoments = [
  {
    interactionKey: 'pi-prompt-1',
    sentAt: '2025-01-01T20:00:02.000Z',
    localDow: 4,
    localHour: 1,
    localDate: '2025-01-02',
  },
  {
    interactionKey: 'pi-prompt-2',
    sentAt: '2025-01-01T20:30:00.000Z',
    localDow: 4,
    localHour: 2,
    localDate: '2025-01-02',
  },
];

let fixture: IngestFixture;
let sessionPath: string;

afterEach(async () => {
  fixture.close();
  await cleanupIngestFixtures();
});

/** Every stored Interaction, in the order the log opened them. */
function storedInteractions() {
  return fixture.database
    .select()
    .from(interactions)
    .orderBy(interactions.id)
    .all();
}

function storedInteractionKeys() {
  return storedInteractions().map((row) => row.interactionKey);
}

function storedInteraction(interactionKey: string) {
  return storedInteractions().find(
    (row) => row.interactionKey === interactionKey,
  );
}

function projectPathOf(interactionKey: string) {
  return fixture.database
    .select({ rootPath: projects.rootPath })
    .from(interactions)
    .innerJoin(projects, eq(interactions.projectId, projects.id))
    .where(eq(interactions.interactionKey, interactionKey))
    .get()?.rootPath;
}

describe('pi log grammar', () => {
  describe('a Session ingested from a pi log', () => {
    beforeEach(async () => {
      fixture = await createIngestFixture('pi');
      sessionPath = fixture.sessionPath(stableSessionId);
      await writeJsonLines(sessionPath, sessionRecords);
      await createIngestHandler(piIngestAdapter, {
        resolveProject: literalCwdProjectResolver,
      }).run(null, {
        correlationId: 'pi-correlation-1',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });
    });

    it('is keyed by its Harness, its stable session id and its log file path', () => {
      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          harness: 'pi',
          stableSessionId,
          logFilePath: sessionPath,
        }),
      ]);
    });

    it('starts at the moment its session record was written', () => {
      expect(fixture.database.select().from(sessions).get()).toMatchObject({
        startedAt: Date.parse('2025-01-01T20:00:00.000Z'),
      });
    });

    it('ends at the moment its last record was written', () => {
      expect(fixture.database.select().from(sessions).get()).toMatchObject({
        endedAt: Date.parse('2025-01-01T20:30:01.000Z'),
      });
    });

    it('stores one Interaction per genuine prompt a Model answered, in log order', () => {
      expect(storedInteractionKeys()).toEqual(['pi-prompt-1', 'pi-prompt-2']);
    });

    it('stamps every Interaction with the Harness whose log it came from', () => {
      expect(storedInteractions().map((row) => row.harness)).toEqual([
        'pi',
        'pi',
      ]);
    });

    it('drops a genuine prompt no Model answered', () => {
      expect(storedInteractionKeys()).not.toContain('response-less-prompt');
    });

    it.each(recordsThatAreNotPrompts)(
      'opens no Interaction for a record that is not a genuine prompt',
      (recordId) => {
        expect(storedInteractionKeys()).not.toContain(recordId);
      },
    );

    it("resolves no Model from the log's own Model change events", () => {
      expect(storedInteractions().map((row) => row.modelRaw)).toEqual(
        expect.not.arrayContaining([
          'wrong-ui-model',
          'another-wrong-ui-model',
        ]),
      );
    });

    it.each(servingModels)(
      'stores the serving Model under its canonical identity, free of variant tag and snapshot date',
      ({ interactionKey, model }) => {
        expect(storedInteraction(interactionKey)).toMatchObject({ model });
      },
    );

    it.each(promptMoments)(
      'timestamps an Interaction at the moment its prompt was sent',
      ({ interactionKey, sentAt }) => {
        expect(storedInteraction(interactionKey)).toMatchObject({
          timestamp: Date.parse(sentAt),
        });
      },
    );

    it.each(promptMoments)(
      "buckets an Interaction into the local day the Store's timezone puts it in",
      ({ interactionKey, localDow, localHour, localDate }) => {
        expect(storedInteraction(interactionKey)).toMatchObject({
          localDow,
          localHour,
          localDate,
        });
      },
    );

    it.each([
      'subInputTokens',
      'subOutputTokens',
      'subCacheReadTokens',
      'subCacheWriteTokens',
    ] as const)(
      'leaves a sub-agent token bucket absent on every Interaction, pi never logging sub-agent usage',
      (bucket) => {
        expect(storedInteractions().map((row) => row[bucket])).toEqual([
          null,
          null,
        ]);
      },
    );

    describe('an Interaction several Models responded to', () => {
      const interactionKey = 'pi-prompt-1';

      it('is served by the Model that produced the most output tokens', () => {
        expect(storedInteraction(interactionKey)).toMatchObject({
          modelRaw: 'claude-opus-4-8[1m]',
        });
      });

      it('sums each main token bucket across every response it received', () => {
        expect(storedInteraction(interactionKey)).toMatchObject({
          mainInputTokens: 10,
          mainOutputTokens: 22,
          mainCacheReadTokens: 5,
          mainCacheWriteTokens: 3,
        });
      });

      it('discloses that it spawned sub-agents when a response called one', () => {
        expect(storedInteraction(interactionKey)).toMatchObject({
          spawnedSubagents: true,
        });
      });

      it("takes its Project from the Session's working directory when its prompt names none", () => {
        expect(projectPathOf(interactionKey)).toBe(sessionCwd);
      });
    });

    describe('an Interaction one Model responded to', () => {
      const interactionKey = 'pi-prompt-2';

      it('is served by that Model', () => {
        expect(storedInteraction(interactionKey)).toMatchObject({
          modelRaw: 'gpt-5.4-20260217',
        });
      });

      it('keeps a bucket that Model reported as zero as a measurement', () => {
        expect(storedInteraction(interactionKey)).toMatchObject({
          mainOutputTokens: 0,
        });
      });

      it.each([
        'mainInputTokens',
        'mainCacheReadTokens',
        'mainCacheWriteTokens',
      ] as const)(
        'leaves a main token bucket that Model never reported absent',
        (bucket) => {
          expect(storedInteraction(interactionKey)?.[bucket]).toBeNull();
        },
      );

      it('discloses no sub-agents when no response called one', () => {
        expect(storedInteraction(interactionKey)).toMatchObject({
          spawnedSubagents: false,
        });
      });

      it('takes its Project from the working directory its own prompt names', () => {
        expect(projectPathOf(interactionKey)).toBe(promptCwd);
      });
    });
  });
});
