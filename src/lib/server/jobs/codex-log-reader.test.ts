import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interactions, sessions } from '../database/schema';
import { codexIngestAdapter } from './codex-adapter';
import { createIngestHandler } from './ingest-pipeline';
import {
  cleanupIngestFixtures,
  codexRecords,
  createIngestFixture,
  writeJsonLines,
  type IngestFixture,
} from './ingest-fixture';

let fixture: IngestFixture;

const resolveProject = vi.fn(async () => ({
  rootPath: '/work/codex',
  gitRemoteUrl: null,
}));

beforeEach(async () => {
  resolveProject.mockClear();
  fixture = await createIngestFixture('codex');
});

afterEach(async () => {
  fixture.close();
  await cleanupIngestFixtures();
});

async function ingest() {
  await createIngestHandler(codexIngestAdapter, { resolveProject }).run(null, {
    correlationId: 'codex-ingest',
    database: fixture.database,
    progress: vi.fn(),
    log: vi.fn(),
  });
}

/** Every Session the ingest stored. */
function storedSessions() {
  return fixture.database.select().from(sessions).all();
}

/** Every stored Interaction, in the order the ingest wrote them. */
function storedInteractions() {
  return fixture.database
    .select()
    .from(interactions)
    .orderBy(interactions.id)
    .all();
}

/** The key of every stored Interaction, in the order the ingest wrote them. */
function storedInteractionKeys() {
  return storedInteractions().map((interaction) => interaction.interactionKey);
}

/** A user message replayed into the response stream rather than a fresh prompt. */
const replayedPrompt = (timestamp: string) => ({
  timestamp,
  type: 'response_item',
  payload: { type: 'message', role: 'user' },
});

describe('Codex log grammar', () => {
  describe('a Session ingested from a Codex rollout', () => {
    const stableSessionId = '11111111-1111-4111-8111-111111111111';

    beforeEach(async () => {
      const firstUsage = codexRecords.tokenCount(
        '2025-01-02T20:01:04.000Z',
        { input: 100, cached: 40, output: 15 },
        { input: 100, cached: 40, output: 15 },
      );
      const secondUsage = codexRecords.tokenCount(
        '2025-01-02T20:01:08.000Z',
        { input: 60, cached: 10, output: 20 },
        { input: 160, cached: 50, output: 35 },
      );
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:01:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:01:01.000Z', 'codex-prompt-1'),
        codexRecords.assistant('2025-01-02T20:01:02.000Z'),
        firstUsage,
        { ...firstUsage, timestamp: '2025-01-02T20:01:05.000Z' },
        codexRecords.turnContext(
          '2025-01-02T20:01:06.000Z',
          'codex-prompt-1',
          'gpt-5.2-codex',
          '/work/other-project',
        ),
        codexRecords.assistant('2025-01-02T20:01:07.000Z'),
        secondUsage,
        { ...secondUsage, timestamp: '2025-01-02T20:01:09.000Z' },
      ]);
      await ingest();
    });

    it('records the Session under the identifier its metadata record carries', () => {
      expect(storedSessions()).toEqual([
        expect.objectContaining({ harness: 'codex', stableSessionId }),
      ]);
    });

    it('records the rollout file the Session was read from', () => {
      expect(storedSessions()).toEqual([
        expect.objectContaining({
          logFilePath: fixture.sessionPath(stableSessionId),
        }),
      ]);
    });

    it('spans the Session from its earliest record to its latest', () => {
      expect(storedSessions()).toEqual([
        expect.objectContaining({
          startedAt: Date.parse('2025-01-02T20:00:00.000Z'),
          endedAt: Date.parse('2025-01-02T20:01:09.000Z'),
        }),
      ]);
    });

    it('stores one Interaction for a prompt the Model answered across many turns', () => {
      expect(storedInteractions()).toHaveLength(1);
    });

    it('keys the Interaction by the turn identifier its turn context carries', () => {
      expect(storedInteractionKeys()).toEqual(['codex-prompt-1']);
    });

    it('times the Interaction from the prompt that opened it', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({
          timestamp: Date.parse('2025-01-02T20:01:00.000Z'),
        }),
      ]);
    });

    it('buckets the Interaction into the local weekday, hour and date of the configured timezone', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({
          localDow: 5,
          localHour: 1,
          localDate: '2025-01-03',
        }),
      ]);
    });

    it('canonicalises the Model spelling the turn context recorded, keeping the raw spelling beside it', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({
          model: 'gpt-5.1-codex-max',
          modelRaw: 'gpt-5.1-codex-max-20260701',
        }),
      ]);
    });

    it('resolves the Project from the working directory the opening turn context names', () => {
      expect(resolveProject).toHaveBeenCalledWith('/work/codex/subdirectory');
    });

    it('holds that attribution against a later turn context naming another working directory', () => {
      expect(resolveProject).not.toHaveBeenCalledWith('/work/other-project');
      expect(resolveProject).toHaveBeenCalledTimes(1);
    });

    it('sums the usage of every turn the Model took within the Interaction', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({
          mainInputTokens: 110,
          mainCacheReadTokens: 50,
          mainOutputTokens: 35,
        }),
      ]);
    });

    it('leaves the cache-write bucket unreported, Codex recording no cache writes', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({ mainCacheWriteTokens: null }),
      ]);
    });

    it('leaves the sub-agent buckets unreported, Codex spawning no sub-agents', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({
          subInputTokens: null,
          subOutputTokens: null,
          subCacheReadTokens: null,
          subCacheWriteTokens: null,
          spawnedSubagents: false,
        }),
      ]);
    });
  });

  describe('a Session whose turn contexts carry no turn identifier', () => {
    beforeEach(async () => {
      const stableSessionId = '22222222-2222-4222-8222-222222222222';
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:02:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:02:01.000Z', undefined),
        codexRecords.assistant('2025-01-02T20:02:02.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:02:03.000Z',
          { input: 10, cached: 2, output: 3 },
          { input: 10, cached: 2, output: 3 },
        ),
      ]);
      await ingest();
    });

    it('keys the Interaction by the timestamp of the prompt that opened it', () => {
      expect(storedInteractionKeys()).toEqual(['2025-01-02T20:02:00.000Z']);
    });

    it('subtracts the cached input from the input bucket, Codex reporting the two disjointly', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({
          mainInputTokens: 8,
          mainCacheReadTokens: 2,
          mainOutputTokens: 3,
        }),
      ]);
    });
  });

  describe('a Session carrying several prompts', () => {
    beforeEach(async () => {
      const stableSessionId = '33333333-3333-4333-8333-333333333333';
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:03:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:03:01.000Z', 'prompt-one'),
        codexRecords.assistant('2025-01-02T20:03:02.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:03:03.000Z',
          { input: 50, cached: 20, output: 10 },
          { input: 50, cached: 20, output: 10 },
        ),
        replayedPrompt('2025-01-02T20:03:04.000Z'),
        codexRecords.prompt('2025-01-02T20:04:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:04:01.000Z', 'prompt-two'),
        codexRecords.assistant('2025-01-02T20:04:02.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:04:03.000Z',
          { input: 30, cached: 5, output: 7 },
          { input: 80, cached: 25, output: 17 },
        ),
        codexRecords.prompt('2025-01-02T20:05:00.000Z'),
        codexRecords.turnContext(
          '2025-01-02T20:05:01.000Z',
          'unanswered-prompt',
        ),
        codexRecords.tokenCount(
          '2025-01-02T20:05:02.000Z',
          { input: 20, cached: 5, output: 0 },
          { input: 100, cached: 30, output: 17 },
        ),
      ]);
      await ingest();
    });

    it('stores the Interactions in the order the rollout records their prompts', () => {
      expect(storedInteractionKeys()).toEqual(['prompt-one', 'prompt-two']);
    });

    it('attributes to each Interaction only the usage recorded since the previous prompt', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({
          interactionKey: 'prompt-one',
          mainInputTokens: 30,
          mainCacheReadTokens: 20,
          mainOutputTokens: 10,
        }),
        expect.objectContaining({
          interactionKey: 'prompt-two',
          mainInputTokens: 25,
          mainCacheReadTokens: 5,
          mainOutputTokens: 7,
        }),
      ]);
    });
  });

  describe('a Session whose usage records restate a cumulative total already reached', () => {
    beforeEach(async () => {
      const stableSessionId = '44444444-4444-4444-8444-444444444444';
      const usage = codexRecords.tokenCount(
        '2025-01-02T20:20:03.000Z',
        { input: 10, cached: 2, output: 3 },
        { input: 10, cached: 2, output: 3 },
      );
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:20:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:20:01.000Z', 'restated-prompt'),
        codexRecords.assistant('2025-01-02T20:20:02.000Z'),
        usage,
        { ...usage, timestamp: '2025-01-02T20:20:04.000Z' },
        codexRecords.tokenCount(
          '2025-01-02T20:20:05.000Z',
          { input: 99, cached: 0, output: 99 },
          { input: 5, cached: 1, output: 2 },
        ),
      ]);
      await ingest();
    });

    it('counts only a usage record whose cumulative total exceeds the highest already seen', () => {
      expect(storedInteractions()).toEqual([
        expect.objectContaining({
          mainInputTokens: 8,
          mainCacheReadTokens: 2,
          mainOutputTokens: 3,
        }),
      ]);
    });
  });

  describe('a Session whose prompt is replayed into the response stream', () => {
    beforeEach(async () => {
      const stableSessionId = '66666666-6666-4666-8666-666666666666';
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:30:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:30:01.000Z', 'replayed-prompt'),
        replayedPrompt('2025-01-02T20:30:02.000Z'),
        codexRecords.assistant('2025-01-02T20:30:03.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:30:04.000Z',
          { input: 10, cached: 2, output: 3 },
          { input: 10, cached: 2, output: 3 },
        ),
      ]);
      await ingest();
    });

    it('opens no Interaction for the replay', () => {
      expect(storedInteractionKeys()).toEqual(['replayed-prompt']);
    });
  });

  describe('a Session whose prompts the rollout leaves incomplete', () => {
    beforeEach(async () => {
      const stableSessionId = '77777777-7777-4777-8777-777777777777';
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:10:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:10:01.000Z', 'complete-prompt'),
        codexRecords.assistant('2025-01-02T20:10:02.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:10:03.000Z',
          { input: 10, cached: 2, output: 3 },
          { input: 10, cached: 2, output: 3 },
        ),
        codexRecords.prompt('2025-01-02T20:11:00.000Z'),
        codexRecords.turnContext(
          '2025-01-02T20:11:01.000Z',
          'unanswered-prompt',
        ),
        codexRecords.tokenCount(
          '2025-01-02T20:11:02.000Z',
          { input: 5, cached: 1, output: 1 },
          { input: 15, cached: 3, output: 4 },
        ),
        codexRecords.prompt('2025-01-02T20:12:00.000Z'),
        codexRecords.turnContext(
          '2025-01-02T20:12:01.000Z',
          'unmeasured-prompt',
        ),
        codexRecords.assistant('2025-01-02T20:12:02.000Z'),
        codexRecords.prompt('2025-01-02T20:13:00.000Z'),
        codexRecords.assistant('2025-01-02T20:13:01.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:13:02.000Z',
          { input: 5, cached: 1, output: 1 },
          { input: 20, cached: 4, output: 5 },
        ),
      ]);
      await ingest();
    });

    it('stores the prompt whose turn context, reply and usage the rollout all record', () => {
      expect(storedInteractionKeys()).toEqual(['complete-prompt']);
    });

    it('drops a prompt the Model never answered', () => {
      expect(storedInteractionKeys()).not.toContain('unanswered-prompt');
    });

    it('drops a prompt for which no usage was ever recorded', () => {
      expect(storedInteractionKeys()).not.toContain('unmeasured-prompt');
    });

    it('drops a prompt no turn context ever attributed to a working directory', () => {
      expect(storedInteractionKeys()).not.toContain('2025-01-02T20:13:00.000Z');
    });
  });

  describe('a rollout found only in the archive Log source', () => {
    const stableSessionId = '55555555-5555-4555-8555-555555555555';
    let archivedPath: string;

    beforeEach(async () => {
      const [, archivedSessions] = fixture.logSources;
      archivedPath = join(
        archivedSessions,
        `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
      );
      await writeJsonLines(archivedPath, [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:08:00.000Z'),
        codexRecords.turnContext(
          '2025-01-02T20:08:01.000Z',
          'archived-prompt',
          'gpt-5.1-codex',
          '/work/codex',
        ),
        codexRecords.assistant('2025-01-02T20:08:02.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:08:03.000Z',
          { input: 10, cached: 2, output: 3 },
          { input: 10, cached: 2, output: 3 },
        ),
      ]);
      await ingest();
    });

    it('stores the Session it describes', () => {
      expect(storedSessions()).toEqual([
        expect.objectContaining({ stableSessionId, logFilePath: archivedPath }),
      ]);
    });

    it('stores the Interactions it records', () => {
      expect(storedInteractionKeys()).toEqual(['archived-prompt']);
    });
  });

  describe('a rollout that never names a working directory', () => {
    beforeEach(async () => {
      const stableSessionId = '88888888-8888-4888-8888-888888888888';
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:14:00.000Z'),
        codexRecords.assistant('2025-01-02T20:14:01.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:14:02.000Z',
          { input: 10, cached: 2, output: 3 },
          { input: 10, cached: 2, output: 3 },
        ),
      ]);
      await ingest();
    });

    it('stores no Session', () => {
      expect(storedSessions()).toEqual([]);
    });
  });

  describe('a rollout the reader cannot make sense of', () => {
    const stableSessionId = '99999999-9999-4999-8999-999999999999';

    it('rejects a rollout that does not open with a session metadata record', async () => {
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.prompt('2025-01-02T20:40:00.000Z'),
        codexRecords.sessionMetadata(stableSessionId),
      ]);
      await expect(ingest()).rejects.toThrow(
        /does not start with a session_meta record/,
      );
    });

    it('rejects a session metadata record that carries no identifier', async () => {
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        {
          timestamp: '2025-01-02T20:00:00.000Z',
          type: 'session_meta',
          payload: {},
        },
      ]);
      await expect(ingest()).rejects.toThrow(
        /Codex session metadata has no id/,
      );
    });

    it('rejects a prompt that carries no timestamp', async () => {
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        { type: 'event_msg', payload: { type: 'user_message' } },
      ]);
      await expect(ingest()).rejects.toThrow(
        /Codex user_message has an invalid timestamp/,
      );
    });

    it('rejects a turn context that names no working directory', async () => {
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:41:00.000Z'),
        {
          timestamp: '2025-01-02T20:41:01.000Z',
          type: 'turn_context',
          payload: { turn_id: 'homeless-prompt', model: 'gpt-5.1-codex' },
        },
      ]);
      await expect(ingest()).rejects.toThrow(/Codex turn_context has no cwd/);
    });

    it('rejects a turn context that names no Model', async () => {
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:42:00.000Z'),
        {
          timestamp: '2025-01-02T20:42:01.000Z',
          type: 'turn_context',
          payload: { turn_id: 'modelless-prompt', cwd: '/work/codex' },
        },
      ]);
      await expect(ingest()).rejects.toThrow(/Codex turn_context has no model/);
    });

    it('rejects a usage record whose cached input exceeds its input', async () => {
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:43:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:43:01.000Z', 'over-cached'),
        codexRecords.assistant('2025-01-02T20:43:02.000Z'),
        codexRecords.tokenCount(
          '2025-01-02T20:43:03.000Z',
          { input: 5, cached: 9, output: 1 },
          { input: 5, cached: 9, output: 1 },
        ),
      ]);
      await expect(ingest()).rejects.toThrow(
        /Codex cached_input_tokens exceeds input_tokens/,
      );
    });

    it('rejects a token count that is not a non-negative integer', async () => {
      await writeJsonLines(fixture.sessionPath(stableSessionId), [
        codexRecords.sessionMetadata(stableSessionId),
        codexRecords.prompt('2025-01-02T20:44:00.000Z'),
        codexRecords.turnContext('2025-01-02T20:44:01.000Z', 'negative-usage'),
        codexRecords.assistant('2025-01-02T20:44:02.000Z'),
        {
          timestamp: '2025-01-02T20:44:03.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              total_token_usage: { total_tokens: -1 },
              last_token_usage: null,
            },
          },
        },
      ]);
      await expect(ingest()).rejects.toThrow(
        /Codex total_token_usage.total_tokens is not a non-negative integer/,
      );
    });
  });
});
