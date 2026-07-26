import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../database/connection';
import { jobRuns } from '../database/schema';
import { JobDispatcher, reconcileInterruptedJobRuns } from './dispatcher';
import { JobEventSource } from './events';
import { JobRunStream, type JobRunStreamEvent } from './job-run-stream';
import { InProcessJobBackend } from './types';

const temporaryDirectories: string[] = [];

async function createFixture() {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-job-run-'));
  temporaryDirectories.push(dataDirectory);
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  const listenerErrors = vi.fn();
  const events = new JobEventSource({ onListenerError: listenerErrors });
  const backend = new InProcessJobBackend(connection.database);
  const dispatcher = new JobDispatcher(connection.database, events, {
    backend,
  });
  return {
    ...connection,
    backend,
    dispatcher,
    events,
    listenerErrors,
    stream: new JobRunStream(connection.database, events),
    record(values: Partial<typeof jobRuns.$inferInsert> = {}): string {
      const correlationId = randomUUID();
      connection.database
        .insert(jobRuns)
        .values({
          type: 'ingest',
          scope: randomUUID(),
          correlationId,
          status: 'running',
          startedAt: 1_000,
          ...values,
        })
        .run();
      return correlationId;
    },
  };
}

function open(
  stream: JobRunStream,
  correlationId: string,
): AsyncIterable<JobRunStreamEvent> {
  const events = stream.open(correlationId);
  if (!events) throw new Error(`No Job run stream for ${correlationId}`);
  return events;
}

async function take(
  events: AsyncIterable<JobRunStreamEvent>,
  count: number,
): Promise<JobRunStreamEvent[]> {
  const collected: JobRunStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
    if (collected.length === count) break;
  }
  return collected;
}

async function drain(
  events: AsyncIterable<JobRunStreamEvent>,
): Promise<JobRunStreamEvent[]> {
  const collected: JobRunStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Job run stream contract', () => {
  it('opens with a snapshot of the persisted run when nothing has been emitted', async () => {
    const fixture = await createFixture();

    try {
      const correlationId = fixture.record({ filesTotal: 7, filesDone: 3 });

      const collected = await take(open(fixture.stream, correlationId), 1);

      expect(collected).toEqual([
        {
          kind: 'snapshot',
          correlationId,
          status: 'running',
          filesTotal: 7,
          filesDone: 3,
          currentFile: null,
          error: null,
          timestamp: expect.any(Number),
        },
      ]);
    } finally {
      fixture.close();
    }
  });

  it('reports a run interrupted by an earlier process, with nothing in the live source', async () => {
    const fixture = await createFixture();

    try {
      const correlationId = fixture.record({ filesTotal: 4, filesDone: 2 });
      reconcileInterruptedJobRuns(fixture.database, () => 5_000);

      const collected = await drain(open(fixture.stream, correlationId));

      expect(fixture.events.history(correlationId)).toHaveLength(0);
      expect(collected).toEqual([
        expect.objectContaining({
          kind: 'snapshot',
          status: 'interrupted',
          filesTotal: 4,
          filesDone: 2,
        }),
        {
          kind: 'done',
          correlationId,
          status: 'interrupted',
          error: null,
          timestamp: 5_000,
        },
      ]);
    } finally {
      fixture.close();
    }
  });

  it('delivers the terminal event once when the live source already holds it', async () => {
    const fixture = await createFixture();

    try {
      fixture.backend.register(
        { type: 'settling' },
        {
          run: async (_payload, context) => {
            context.log('reading a.jsonl');
          },
        },
      );
      const { correlationId } = fixture.dispatcher.dispatch({
        identity: { type: 'settling' },
        payload: null,
      });
      await drain(open(fixture.stream, correlationId));

      const collected = await drain(open(fixture.stream, correlationId));

      expect(
        fixture.events
          .history(correlationId)
          .filter(({ kind }) => kind === 'done'),
      ).toHaveLength(1);
      expect(collected.map(({ kind }) => kind)).toEqual([
        'snapshot',
        'log',
        'done',
      ]);
      expect(collected.at(-1)).toMatchObject({
        status: 'succeeded',
        error: null,
      });
    } finally {
      fixture.close();
    }
  });

  it('tears down idempotently when a consumer stops while a terminal event is queued', async () => {
    const fixture = await createFixture();

    try {
      const correlationId = fixture.record({
        status: 'succeeded',
        finishedAt: 2_000,
        filesTotal: 1,
        filesDone: 1,
      });
      const iterator = open(fixture.stream, correlationId)[
        Symbol.asyncIterator
      ]();

      await expect(iterator.next()).resolves.toMatchObject({
        value: { kind: 'snapshot' },
        done: false,
      });
      await expect(iterator.return?.()).resolves.toEqual({
        value: undefined,
        done: true,
      });
      await expect(iterator.return?.()).resolves.toEqual({
        value: undefined,
        done: true,
      });

      fixture.events.emit({
        kind: 'log',
        correlationId,
        message: 'emitted after teardown',
        timestamp: 3_000,
      });

      await expect(iterator.next()).resolves.toEqual({
        value: undefined,
        done: true,
      });
      expect(fixture.listenerErrors).not.toHaveBeenCalled();
    } finally {
      fixture.close();
    }
  });

  it('gives a reconnecting watcher a fresh snapshot and replays no progress', async () => {
    const fixture = await createFixture();

    try {
      const correlationId = fixture.record({ filesTotal: 4, filesDone: 1 });
      fixture.events.emit({
        kind: 'log',
        correlationId,
        message: 'reading a.jsonl',
        timestamp: 1_100,
      });
      fixture.events.emit({
        kind: 'progress',
        correlationId,
        filesTotal: 4,
        filesDone: 2,
        currentFile: 'a.jsonl',
        timestamp: 1_200,
      });

      const first = await take(open(fixture.stream, correlationId), 2);

      fixture.database
        .update(jobRuns)
        .set({ filesDone: 3 })
        .where(eq(jobRuns.correlationId, correlationId))
        .run();
      fixture.events.emit({
        kind: 'progress',
        correlationId,
        filesTotal: 4,
        filesDone: 3,
        currentFile: 'b.jsonl',
        timestamp: 1_300,
      });

      const reconnected = open(fixture.stream, correlationId);
      fixture.events.emit({
        kind: 'progress',
        correlationId,
        filesTotal: 4,
        filesDone: 4,
        currentFile: 'c.jsonl',
        timestamp: 1_400,
      });
      const second = await take(reconnected, 3);

      expect(first.map(({ kind }) => kind)).toEqual(['snapshot', 'log']);
      expect(second).toEqual([
        expect.objectContaining({
          kind: 'snapshot',
          filesTotal: 4,
          filesDone: 3,
          currentFile: null,
        }),
        expect.objectContaining({ kind: 'log', message: 'reading a.jsonl' }),
        expect.objectContaining({
          kind: 'progress',
          filesDone: 4,
          currentFile: 'c.jsonl',
        }),
      ]);
    } finally {
      fixture.close();
    }
  });

  it('follows a live run through its deltas and completes after the terminal event', async () => {
    const fixture = await createFixture();

    try {
      const gate = Promise.withResolvers<void>();
      fixture.backend.register(
        { type: 'live' },
        {
          run: async (_payload, context) => {
            await gate.promise;
            context.log('reading a.jsonl');
            context.progress({
              filesTotal: 2,
              filesDone: 1,
              currentFile: 'a.jsonl',
            });
            context.progress({
              filesTotal: 2,
              filesDone: 2,
              currentFile: 'b.jsonl',
            });
          },
        },
      );
      const { correlationId } = fixture.dispatcher.dispatch({
        identity: { type: 'live' },
        payload: null,
      });

      const collecting = drain(open(fixture.stream, correlationId));
      gate.resolve();
      const collected = await collecting;

      expect(collected.map(({ kind }) => kind)).toEqual([
        'snapshot',
        'log',
        'progress',
        'progress',
        'done',
      ]);
      expect(collected[0]).toMatchObject({
        kind: 'snapshot',
        status: 'running',
        filesTotal: 0,
        filesDone: 0,
      });
      expect(collected[3]).toMatchObject({
        filesTotal: 2,
        filesDone: 2,
        currentFile: 'b.jsonl',
      });
      expect(collected[4]).toMatchObject({
        status: 'succeeded',
        error: null,
      });
    } finally {
      fixture.close();
    }
  });

  it('has no stream for an unknown correlation id', async () => {
    const fixture = await createFixture();

    try {
      expect(fixture.stream.open(randomUUID())).toBeUndefined();
    } finally {
      fixture.close();
    }
  });
});
