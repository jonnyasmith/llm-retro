import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Harness } from '../../jobs/contracts';
import { openDatabase, type Connection } from '../database/connection';
import { persistSettings } from '../database/store';

interface HarnessLayout {
  /** Log source roots, relative to the fixture root, pinned as overrides. */
  logSources: string[];
  /** Where a primary session file must sit for the adapter to enumerate it. */
  sessionDirectory: string;
  sessionFileName(stableSessionId: string): string;
}

const harnessLayouts: Record<Harness, HarnessLayout> = {
  claude: {
    logSources: ['claude-projects'],
    sessionDirectory: join('claude-projects', '-work-alpha'),
    sessionFileName: (stableSessionId) => `${stableSessionId}.jsonl`,
  },
  codex: {
    logSources: [join('codex', 'sessions'), join('codex', 'archived_sessions')],
    sessionDirectory: join('codex', 'sessions', '2025', '01', '02'),
    sessionFileName: (stableSessionId) =>
      `rollout-2025-01-02T20-00-00-${stableSessionId}.jsonl`,
  },
  pi: {
    logSources: ['pi-sessions'],
    sessionDirectory: join('pi-sessions', '--work-alpha--'),
    sessionFileName: (stableSessionId) =>
      `2025-01-01T20-00-00-000Z_${stableSessionId}.jsonl`,
  },
  omp: {
    logSources: ['omp-sessions'],
    sessionDirectory: join('omp-sessions', '-work-alpha-'),
    sessionFileName: (stableSessionId) =>
      `2025-01-01T20-00-00-000Z_${stableSessionId}.jsonl`,
  },
};

/** A temporary Log source tree paired with the Store an ingest writes into. */
export interface IngestFixture extends Connection {
  readonly logSources: string[];
  readonly sessionDirectory: string;
  sessionPath(stableSessionId: string): string;
}

const temporaryDirectories: string[] = [];

export async function createIngestFixture(
  harness: Harness,
): Promise<IngestFixture> {
  const layout = harnessLayouts[harness];
  const root = await mkdtemp(join(tmpdir(), `llm-retro-${harness}-ingest-`));
  temporaryDirectories.push(root);
  const logSources = layout.logSources.map((path) => join(root, path));
  const sessionDirectory = join(root, layout.sessionDirectory);
  await Promise.all([
    ...logSources.map((path) => mkdir(path, { recursive: true })),
    mkdir(sessionDirectory, { recursive: true }),
  ]);

  const connection = openDatabase({ LLM_RETRO_DATA_DIR: join(root, 'data') });
  persistSettings(connection.database, {
    timezone: 'Asia/Kolkata',
    logSourceOverrides: { [harness]: logSources },
  });

  return {
    ...connection,
    logSources,
    sessionDirectory,
    sessionPath: (stableSessionId: string) =>
      join(sessionDirectory, layout.sessionFileName(stableSessionId)),
  };
}

export async function cleanupIngestFixtures() {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}

export async function writeJsonLines(path: string, records: unknown[]) {
  await writeFile(
    path,
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
}

export async function appendJsonLines(path: string, records: unknown[]) {
  await appendFile(
    path,
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
}

export const codexRecords = {
  sessionMetadata: (stableSessionId: string) => ({
    timestamp: '2025-01-02T20:00:00.000Z',
    type: 'session_meta',
    payload: { id: stableSessionId, timestamp: '2025-01-02T20:00:00.000Z' },
  }),
  prompt: (timestamp: string) => ({
    timestamp,
    type: 'event_msg',
    payload: { type: 'user_message' },
  }),
  turnContext: (
    timestamp: string,
    turnId: string | undefined,
    model = 'gpt-5.1-codex-max-20260701',
    cwd = '/work/codex/subdirectory',
  ) => ({
    timestamp,
    type: 'turn_context',
    payload: {
      ...(turnId === undefined ? {} : { turn_id: turnId }),
      cwd,
      model,
    },
  }),
  assistant: (timestamp: string) => ({
    timestamp,
    type: 'event_msg',
    payload: { type: 'agent_message' },
  }),
  tokenCount: (
    timestamp: string,
    last: { input: number; cached: number; output: number },
    total: { input: number; cached: number; output: number },
  ) => ({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: total.input,
          cached_input_tokens: total.cached,
          output_tokens: total.output,
          reasoning_output_tokens: 0,
          total_tokens: total.input + total.output,
        },
        last_token_usage: {
          input_tokens: last.input,
          cached_input_tokens: last.cached,
          output_tokens: last.output,
          reasoning_output_tokens: 0,
          total_tokens: last.input + last.output,
        },
      },
    },
  }),
};

export interface InteractionTotals {
  interactionKey: string;
  model: string;
  mainInputTokens: number | null;
  mainOutputTokens: number | null;
  mainCacheReadTokens: number | null;
  mainCacheWriteTokens: number | null;
}

export interface SessionGrowthScenario {
  initialRecords: unknown[];
  appendedRecords: unknown[];
  expectedTotals: InteractionTotals[];
}

const claudeTwinTotals: InteractionTotals[] = [
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
];

const codexSecondPromptFirstUsage = codexRecords.tokenCount(
  '2025-01-02T20:07:03.000Z',
  { input: 50, cached: 10, output: 8 },
  { input: 150, cached: 50, output: 28 },
);
const codexSecondPromptNextUsage = codexRecords.tokenCount(
  '2025-01-02T20:07:08.000Z',
  { input: 70, cached: 20, output: 12 },
  { input: 220, cached: 70, output: 40 },
);
const codexFirstPromptUsage = codexRecords.tokenCount(
  '2025-01-02T20:06:03.000Z',
  { input: 100, cached: 40, output: 20 },
  { input: 100, cached: 40, output: 20 },
);

/**
 * One Session per Harness whose last Interaction is still in flight when the
 * initial records end, expressed in that Harness's own log grammar.
 */
export const sessionGrowthScenarios: Record<
  Harness,
  (stableSessionId: string) => SessionGrowthScenario
> = {
  claude: () => ({
    initialRecords: [
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
    ],
    appendedRecords: [
      {
        type: 'assistant',
        uuid: 'growing-assistant-2',
        timestamp: '2025-01-01T20:10:20.000Z',
        message: {
          model: 'claude-opus-4-8[1m]',
          usage: { output_tokens: 20, cache_read_input_tokens: 5 },
        },
      },
    ],
    expectedTotals: claudeTwinTotals,
  }),
  codex: (stableSessionId) => ({
    initialRecords: [
      codexRecords.sessionMetadata(stableSessionId),
      codexRecords.prompt('2025-01-02T20:06:00.000Z'),
      codexRecords.turnContext('2025-01-02T20:06:01.000Z', 'complete-prompt'),
      codexRecords.assistant('2025-01-02T20:06:02.000Z'),
      codexFirstPromptUsage,
      { ...codexFirstPromptUsage, timestamp: '2025-01-02T20:06:04.000Z' },
      codexRecords.prompt('2025-01-02T20:07:00.000Z'),
      codexRecords.turnContext('2025-01-02T20:07:01.000Z', 'growing-prompt'),
      codexRecords.assistant('2025-01-02T20:07:02.000Z'),
      codexSecondPromptFirstUsage,
      {
        ...codexSecondPromptFirstUsage,
        timestamp: '2025-01-02T20:07:04.000Z',
      },
    ],
    appendedRecords: [
      codexRecords.turnContext('2025-01-02T20:07:06.000Z', 'growing-prompt'),
      codexRecords.assistant('2025-01-02T20:07:07.000Z'),
      codexSecondPromptNextUsage,
      { ...codexSecondPromptNextUsage, timestamp: '2025-01-02T20:07:09.000Z' },
    ],
    expectedTotals: [
      {
        interactionKey: 'complete-prompt',
        model: 'gpt-5.1-codex-max',
        mainInputTokens: 60,
        mainOutputTokens: 20,
        mainCacheReadTokens: 40,
        mainCacheWriteTokens: null,
      },
      {
        interactionKey: 'growing-prompt',
        model: 'gpt-5.1-codex-max',
        mainInputTokens: 90,
        mainOutputTokens: 20,
        mainCacheReadTokens: 30,
        mainCacheWriteTokens: null,
      },
    ],
  }),
  pi: (stableSessionId) => ({
    initialRecords: [
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
          model: 'claude-sonnet-4-6-20260217',
          usage: { input: 7, output: 7 },
          content: [{ type: 'text', text: 'Done' }],
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
          content: [{ type: 'text', text: 'Starting' }],
        },
      },
    ],
    appendedRecords: [
      {
        type: 'message',
        id: 'growing-assistant-2',
        timestamp: '2025-01-01T20:10:02.000Z',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-8[1m]',
          usage: { output: 20, cacheRead: 5 },
          content: [{ type: 'text', text: 'Finished' }],
        },
      },
    ],
    expectedTotals: claudeTwinTotals,
  }),
  omp: (stableSessionId) => ({
    initialRecords: [
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
          model: 'claude-sonnet-4-6-20260217',
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
    ],
    appendedRecords: [
      {
        type: 'message',
        id: 'growing-assistant-2',
        timestamp: '2025-01-01T20:10:02.000Z',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-8[1m]',
          usage: { output: 20, cacheRead: 5 },
        },
      },
    ],
    expectedTotals: claudeTwinTotals,
  }),
};
