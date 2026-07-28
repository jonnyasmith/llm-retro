import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interactions, sessions } from '../database/schema';
import { createIngestHandler } from './ingest-pipeline';
import { ompIngestAdapter } from './omp-adapter';
import {
  cleanupIngestFixtures,
  createIngestFixture,
  writeJsonLines,
  type IngestFixture,
} from './ingest-fixture';

const STABLE_SESSION_ID = '11111111-1111-4111-8111-111111111111';

const sessionRecord = {
  type: 'session',
  version: 3,
  id: STABLE_SESSION_ID,
  timestamp: '2025-01-01T20:00:00.000Z',
  cwd: '/work/alpha/subdirectory',
};

const firstPrompt = {
  type: 'message',
  id: 'omp-prompt-1',
  timestamp: '2025-01-01T20:00:01.000Z',
  cwd: '/work/alpha/subdirectory',
  message: { role: 'user', content: 'Delegate this' },
};

const unansweredPrompt = {
  type: 'message',
  id: 'response-less-control',
  timestamp: '2025-01-01T20:10:00.000Z',
  message: { role: 'user', content: '/clear' },
};

const secondPrompt = {
  type: 'message',
  id: 'omp-prompt-2',
  timestamp: '2025-01-01T20:30:00.000Z',
  cwd: '/work/beta/subdirectory',
  message: { role: 'user', content: 'Finish here' },
};

const secondAnswer = {
  type: 'message',
  id: 'omp-main-answer-2',
  timestamp: '2025-01-01T20:30:01.000Z',
  message: {
    role: 'assistant',
    model: 'claude-sonnet-4-6[1m]',
    usage: { output: 0 },
  },
};

/** The assistant turn answering the first prompt, spawning one agent per name. */
function delegatingAnswer(agentNames: string[]) {
  return {
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
          arguments: { tasks: agentNames.map((name) => ({ name })) },
        },
      ],
    },
  };
}

/** The `task-result` omp writes into the Session log when an agent finishes. */
function agentOneReport(status: string, timestamp: string) {
  return {
    type: 'message',
    id: 'omp-task-result-1',
    timestamp,
    message: {
      role: 'toolResult',
      toolName: 'task',
      content: `<task-result id="AgentOne" status="${status}">done</task-result>`,
    },
  };
}

const agentOneRecords = [
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
];

const childAgentRecords = [
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
    message: { role: 'assistant', model: 'gpt-5.5', usage: { output: 2 } },
  },
];

const resolveProject = vi.fn(async (cwd: string) => ({
  rootPath: cwd.startsWith('/work/alpha') ? '/work/alpha' : '/work/beta',
  gitRemoteUrl: null,
}));

let fixture: IngestFixture;
let sessionPath: string;
let agentDirectory: string;

beforeEach(async () => {
  fixture = await createIngestFixture('omp');
  sessionPath = fixture.sessionPath(STABLE_SESSION_ID);
  agentDirectory = join(
    fixture.sessionDirectory,
    basename(sessionPath, '.jsonl'),
  );
});

afterEach(async () => {
  fixture.close();
  await cleanupIngestFixtures();
});

/** `AgentOne` beside the Session log, with its own `Child` nested beneath it. */
async function writeAgentLogs() {
  const nestedDirectory = join(agentDirectory, 'AgentOne');
  await mkdir(nestedDirectory, { recursive: true });
  await writeJsonLines(join(agentDirectory, 'AgentOne.jsonl'), agentOneRecords);
  await writeJsonLines(
    join(nestedDirectory, 'AgentOne.Child.jsonl'),
    childAgentRecords,
  );
}

async function ingest() {
  await createIngestHandler(ompIngestAdapter, { resolveProject }).run(null, {
    correlationId: 'omp-correlation-1',
    database: fixture.database,
    progress: vi.fn(),
    log: vi.fn(),
  });
}

function storedSession() {
  return fixture.database.select().from(sessions).get();
}

/** Every stored Interaction, in the order the ingest wrote them. */
function storedInteractions() {
  return fixture.database
    .select()
    .from(interactions)
    .orderBy(interactions.id)
    .all();
}

function storedInteraction(interactionKey: string) {
  return fixture.database
    .select()
    .from(interactions)
    .where(eq(interactions.interactionKey, interactionKey))
    .get();
}

describe('omp log grammar', () => {
  describe('a Session ingested from an omp log', () => {
    beforeEach(async () => {
      await writeAgentLogs();
      await writeFile(
        join(fixture.logSources[0], 'stats.db'),
        'not a SQLite database',
      );
      await writeFile(
        join(fixture.sessionDirectory, 'stats.db'),
        'must never be opened',
      );
      await writeJsonLines(sessionPath, [
        { type: 'title', v: 1, title: 'Raw omp fixture' },
        sessionRecord,
        firstPrompt,
        delegatingAnswer(['AgentOne']),
        agentOneReport('completed', '2025-01-01T20:00:05.000Z'),
        unansweredPrompt,
        secondPrompt,
        secondAnswer,
      ]);
      await ingest();
    });

    it('reads only the JSONL logs beneath the Log source', () => {
      expect(fixture.database.select().from(sessions).all()).toHaveLength(1);
    });

    it('records the Harness whose grammar read it', () => {
      expect(storedSession()).toMatchObject({ harness: 'omp' });
    });

    it('identifies the Session by the id of its session record, wherever that record sits in the log', () => {
      expect(storedSession()).toMatchObject({
        stableSessionId: STABLE_SESSION_ID,
      });
    });

    it('records the path of the log it read', () => {
      expect(storedSession()).toMatchObject({ logFilePath: sessionPath });
    });

    it('starts the Session at the earliest timestamp its records carry', () => {
      expect(storedSession()).toMatchObject({
        startedAt: Date.parse('2025-01-01T20:00:00.000Z'),
      });
    });

    it('ends the Session at the latest timestamp its records carry', () => {
      expect(storedSession()).toMatchObject({
        endedAt: Date.parse('2025-01-01T20:30:01.000Z'),
      });
    });

    it('stores an Interaction for every answered prompt, in the order the log records them', () => {
      expect(storedInteractions().map((row) => row.interactionKey)).toEqual([
        'omp-prompt-1',
        'omp-prompt-2',
      ]);
    });

    it('stores no Interaction for a prompt no Model answered', () => {
      expect(
        storedInteractions().map((row) => row.interactionKey),
      ).not.toContain(unansweredPrompt.id);
    });

    it('stores every Interaction under the Harness that read it', () => {
      expect(storedInteractions().map((row) => row.harness)).toEqual([
        'omp',
        'omp',
      ]);
    });

    it('records the canonical identity of the Model that served each Interaction', () => {
      expect(storedInteractions().map((row) => row.model)).toEqual([
        'gpt-5.6-sol',
        'claude-sonnet-4-6',
      ]);
    });

    it('keeps the raw Model spelling the log used beside it', () => {
      expect(storedInteractions().map((row) => row.modelRaw)).toEqual([
        'gpt-5.6-sol-20260701',
        'claude-sonnet-4-6[1m]',
      ]);
    });

    it('opens each Interaction at the timestamp of the prompt that began it', () => {
      expect(storedInteractions().map((row) => row.timestamp)).toEqual([
        Date.parse('2025-01-01T20:00:01.000Z'),
        Date.parse('2025-01-01T20:30:00.000Z'),
      ]);
    });

    describe('an Interaction that delegated to an agent which delegated in turn', () => {
      const interaction = () => storedInteraction('omp-prompt-1');

      it.each([
        ['mainInputTokens', 10],
        ['mainOutputTokens', 5],
        ['mainCacheReadTokens', 2],
      ] as const)('records the %s the main agent reported', (bucket, total) => {
        expect(interaction()?.[bucket]).toBe(total);
      });

      it('leaves a main bucket the main agent never reported null', () => {
        expect(interaction()?.mainCacheWriteTokens).toBeNull();
      });

      // The spawned agent alone reports input and cache-write Tokens, so these
      // two buckets isolate its contribution from its own sub-agent's.
      it('folds the Tokens of the agent it spawned into its sub buckets', () => {
        expect(interaction()).toMatchObject({
          subInputTokens: 3,
          subCacheWriteTokens: 1,
        });
      });

      // Only the agent one level deeper reports cache-read Tokens.
      it('folds the Tokens of the agents that agent spawned in turn into the same buckets', () => {
        expect(interaction()?.subCacheReadTokens).toBe(4);
      });

      it('totals every depth of the sub-agent tree into one sub bucket', () => {
        expect(interaction()?.subOutputTokens).toBe(20);
      });

      it('never flags the Interaction as having unaccounted sub-agent Tokens', () => {
        expect(interaction()?.spawnedSubagents).toBe(false);
      });
    });

    describe('an Interaction that delegated to nothing', () => {
      const interaction = () => storedInteraction('omp-prompt-2');

      it('records a reported zero as a genuine zero', () => {
        expect(interaction()?.mainOutputTokens).toBe(0);
      });

      it.each([
        'subInputTokens',
        'subOutputTokens',
        'subCacheReadTokens',
        'subCacheWriteTokens',
      ] as const)('leaves its %s null', (bucket) => {
        expect(interaction()?.[bucket]).toBeNull();
      });
    });
  });

  describe('an Interaction whose spawned agent has not reported completion', () => {
    it.each([
      { report: [] },
      { report: [agentOneReport('failed', '2025-01-01T20:00:05.000Z')] },
    ])('leaves every sub bucket null', async ({ report }) => {
      await writeAgentLogs();
      await writeJsonLines(sessionPath, [
        sessionRecord,
        firstPrompt,
        delegatingAnswer(['AgentOne']),
        ...report,
      ]);
      await ingest();

      expect(storedInteraction('omp-prompt-1')).toMatchObject({
        subInputTokens: null,
        subOutputTokens: null,
        subCacheReadTokens: null,
        subCacheWriteTokens: null,
      });
    });
  });

  describe('an Interaction that spawned the same agent twice', () => {
    beforeEach(async () => {
      await writeAgentLogs();
      await writeJsonLines(sessionPath, [
        sessionRecord,
        firstPrompt,
        delegatingAnswer(['AgentOne', 'AgentOne']),
        agentOneReport('completed', '2025-01-01T20:00:05.000Z'),
      ]);
      await ingest();
    });

    it('folds the Tokens of that agent in once', () => {
      expect(storedInteraction('omp-prompt-1')).toMatchObject({
        subInputTokens: 3,
        subOutputTokens: 20,
        subCacheReadTokens: 4,
        subCacheWriteTokens: 1,
      });
    });
  });

  describe('an Interaction whose spawned agent reports back after the next prompt', () => {
    beforeEach(async () => {
      await writeAgentLogs();
      await writeJsonLines(sessionPath, [
        sessionRecord,
        firstPrompt,
        delegatingAnswer(['AgentOne']),
        secondPrompt,
        secondAnswer,
        agentOneReport('completed', '2025-01-01T20:30:05.000Z'),
      ]);
      await ingest();
    });

    it('folds the Tokens of that agent into the Interaction that spawned it', () => {
      expect(storedInteraction('omp-prompt-1')?.subOutputTokens).toBe(20);
    });

    it('leaves the later Interaction that saw it finish without sub-agent Tokens', () => {
      expect(storedInteraction('omp-prompt-2')?.subOutputTokens).toBeNull();
    });
  });

  describe('an Interaction whose spawned agent left no log beside the Session', () => {
    beforeEach(async () => {
      await writeJsonLines(sessionPath, [
        sessionRecord,
        firstPrompt,
        delegatingAnswer(['AgentOne']),
        agentOneReport('completed', '2025-01-01T20:00:05.000Z'),
      ]);
      await ingest();
    });

    it('stores the Interaction with no sub-agent Tokens to fold', () => {
      expect(storedInteractions()).toMatchObject([
        { interactionKey: 'omp-prompt-1', subOutputTokens: null },
      ]);
    });
  });
});
