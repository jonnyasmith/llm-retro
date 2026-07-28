import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { openDatabase, type Connection } from '../database/connection';
import { jobRuns } from '../database/schema';
import { JobDispatcher, reconcileInterruptedJobRuns } from './dispatcher';
import { JobEventSource } from './events';
import { JobRunStream, type JobRunStreamEvent } from './job-run-stream';
import { InProcessJobBackend } from './types';

const temporaryDirectories: string[] = [];

interface StreamFixture extends Connection {
  readonly backend: InProcessJobBackend;
  readonly dispatcher: JobDispatcher;
  readonly events: JobEventSource;
  readonly listenerErrors: Mock;
  readonly stream: JobRunStream;
  /** Persists a Job run the stream can open, defaulting it to running. */
  record(values?: Partial<typeof jobRuns.$inferInsert>): string;
}

async function createFixture(): Promise<StreamFixture> {
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

let fixture: StreamFixture;

function openStream(correlationId: string): AsyncIterable<JobRunStreamEvent> {
  const events = fixture.stream.open(correlationId);
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

function kindsOf(events: JobRunStreamEvent[]): string[] {
  return events.map(({ kind }) => kind);
}

beforeEach(async () => {
  fixture = await createFixture();
});

afterEach(async () => {
  fixture.close();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('JobRunStream', () => {
  describe('with no Job run for the correlation id', () => {
    it('has no stream to open', () => {
      expect(fixture.stream.open(randomUUID())).toBeUndefined();
    });
  });

  describe('with a Job run still running and nothing yet emitted', () => {
    let correlationId: string;

    beforeEach(() => {
      correlationId = fixture.record({ filesTotal: 7, filesDone: 3 });
    });

    it('opens with a snapshot of the run the Store holds', async () => {
      await expect(take(openStream(correlationId), 1)).resolves.toEqual([
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
    });

    it('stays open past the snapshot, the run not having finished', async () => {
      const events = openStream(correlationId);
      fixture.events.emit({
        kind: 'log',
        correlationId,
        message: 'reading a.jsonl',
        timestamp: 1_100,
      });

      await expect(take(events, 2)).resolves.toMatchObject([
        { kind: 'snapshot' },
        { kind: 'log', message: 'reading a.jsonl' },
      ]);
    });
  });

  describe('with a Job run already in a terminal status', () => {
    it.each([
      { status: 'succeeded', error: null },
      { status: 'interrupted', error: null },
      { status: 'failed', error: 'adapter exploded' },
    ] as const)(
      'completes without waiting on the live source',
      async ({ status, error }) => {
        const correlationId = fixture.record({
          status,
          error,
          finishedAt: 2_000,
          filesTotal: 1,
          filesDone: 1,
        });

        const collected = await drain(openStream(correlationId));

        expect(kindsOf(collected)).toEqual(['snapshot', 'done']);
        expect(collected.at(-1)).toMatchObject({ status });
      },
    );
  });

  describe('with a Job run that failed', () => {
    let collected: JobRunStreamEvent[];

    beforeEach(async () => {
      const correlationId = fixture.record({
        status: 'failed',
        error: 'adapter exploded',
        finishedAt: 2_000,
      });
      collected = await drain(openStream(correlationId));
    });

    it('carries the recorded failure in its snapshot', () => {
      expect(collected[0]).toMatchObject({
        kind: 'snapshot',
        status: 'failed',
        error: 'adapter exploded',
      });
    });

    it('carries the recorded failure in its terminal event', () => {
      expect(collected.at(-1)).toMatchObject({
        kind: 'done',
        error: 'adapter exploded',
      });
    });

    it('dates completion at the time the run finished', () => {
      expect(collected.at(-1)).toMatchObject({ timestamp: 2_000 });
    });
  });

  describe('with a Job run interrupted by an earlier process', () => {
    let correlationId: string;
    let collected: JobRunStreamEvent[];

    beforeEach(async () => {
      correlationId = fixture.record({ filesTotal: 4, filesDone: 2 });
      reconcileInterruptedJobRuns(fixture.database, () => 5_000);
      collected = await drain(openStream(correlationId));
    });

    it('has no live event to draw on', () => {
      expect(fixture.events.history(correlationId)).toHaveLength(0);
    });

    it('snapshots the interruption with the progress the run reached', () => {
      expect(collected[0]).toMatchObject({
        kind: 'snapshot',
        status: 'interrupted',
        filesTotal: 4,
        filesDone: 2,
      });
    });

    it('mirrors the reconciled record in its terminal event', () => {
      expect(collected.at(-1)).toEqual({
        kind: 'done',
        correlationId,
        status: 'interrupted',
        error: null,
        timestamp: 5_000,
      });
    });
  });

  describe('with output emitted before any watcher connects', () => {
    let correlationId: string;
    let first: JobRunStreamEvent[];

    beforeEach(async () => {
      correlationId = fixture.record({ filesTotal: 4, filesDone: 1 });
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
      first = await take(openStream(correlationId), 2);
    });

    it('replays the output the run logged before the watcher connected', () => {
      expect(first[1]).toMatchObject({
        kind: 'log',
        message: 'reading a.jsonl',
      });
    });

    it('withholds the missed progress, which the snapshot already carries', () => {
      expect(kindsOf(first)).toEqual(['snapshot', 'log']);
    });

    describe('and a watcher reconnecting once the run has progressed further', () => {
      let second: JobRunStreamEvent[];

      beforeEach(async () => {
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
        const reconnected = openStream(correlationId);
        fixture.events.emit({
          kind: 'progress',
          correlationId,
          filesTotal: 4,
          filesDone: 4,
          currentFile: 'c.jsonl',
          timestamp: 1_400,
        });
        second = await take(reconnected, 3);
      });

      it('snapshots the progress persisted since the first watcher left', () => {
        expect(second[0]).toMatchObject({
          kind: 'snapshot',
          filesTotal: 4,
          filesDone: 3,
        });
      });

      it('forgets the current file, which a snapshot cannot carry', () => {
        expect(second[0]).toMatchObject({
          kind: 'snapshot',
          currentFile: null,
        });
      });

      it('replays the output logged before it connected', () => {
        expect(second[1]).toMatchObject({
          kind: 'log',
          message: 'reading a.jsonl',
        });
      });

      it('delivers only the deltas emitted after it connected', () => {
        expect(second[2]).toMatchObject({
          kind: 'progress',
          filesDone: 4,
          currentFile: 'c.jsonl',
        });
      });
    });
  });

  describe('with a live Job run emitting deltas', () => {
    let correlationId: string;
    let events: AsyncIterable<JobRunStreamEvent>;
    let collected: JobRunStreamEvent[];

    beforeEach(async () => {
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
      ({ correlationId } = fixture.dispatcher.dispatch({
        identity: { type: 'live' },
        payload: null,
      }));
      events = openStream(correlationId);
      const collecting = drain(events);
      gate.resolve();
      collected = await collecting;
    });

    it('opens on the run as dispatched, before it has made progress', () => {
      expect(collected[0]).toMatchObject({
        kind: 'snapshot',
        status: 'running',
        filesTotal: 0,
        filesDone: 0,
      });
    });

    it('relays each delta in the order the run emitted it', () => {
      expect(kindsOf(collected.slice(1, -1))).toEqual([
        'log',
        'progress',
        'progress',
      ]);
    });

    it('relays the progress each delta carried', () => {
      expect(collected[2]).toMatchObject({
        filesTotal: 2,
        filesDone: 1,
        currentFile: 'a.jsonl',
      });
      expect(collected[3]).toMatchObject({
        filesTotal: 2,
        filesDone: 2,
        currentFile: 'b.jsonl',
      });
    });

    it('completes with the status the run finished on', () => {
      expect(collected.at(-1)).toMatchObject({
        kind: 'done',
        status: 'succeeded',
        error: null,
      });
    });

    it('stays closed against anything emitted after completion', async () => {
      fixture.events.emit({
        kind: 'log',
        correlationId,
        message: 'emitted after completion',
        timestamp: 9_000,
      });

      await expect(events[Symbol.asyncIterator]().next()).resolves.toEqual({
        value: undefined,
        done: true,
      });
    });
  });

  describe('with a Job run whose terminal event the live source already holds', () => {
    let correlationId: string;
    let collected: JobRunStreamEvent[];

    beforeEach(async () => {
      fixture.backend.register(
        { type: 'settling' },
        {
          run: async (_payload, context) => {
            context.log('reading a.jsonl');
          },
        },
      );
      ({ correlationId } = fixture.dispatcher.dispatch({
        identity: { type: 'settling' },
        payload: null,
      }));
      await drain(openStream(correlationId));
      collected = await drain(openStream(correlationId));
    });

    it('reopens on a snapshot ahead of the replayed output', () => {
      expect(kindsOf(collected)).toEqual(['snapshot', 'log', 'done']);
    });

    it('completes with the status the run finished on', () => {
      expect(collected.at(-1)).toMatchObject({
        status: 'succeeded',
        error: null,
      });
    });

    it('leaves a single terminal event in the live source', () => {
      expect(
        fixture.events
          .history(correlationId)
          .filter(({ kind }) => kind === 'done'),
      ).toHaveLength(1);
    });
  });

  describe('with a consumer that stops while a terminal event is queued', () => {
    let correlationId: string;
    let iterator: AsyncIterator<JobRunStreamEvent>;

    beforeEach(() => {
      correlationId = fixture.record({
        status: 'succeeded',
        finishedAt: 2_000,
        filesTotal: 1,
        filesDone: 1,
      });
      iterator = openStream(correlationId)[Symbol.asyncIterator]();
    });

    it('hands the consumer the snapshot ahead of the terminal event', async () => {
      await expect(iterator.next()).resolves.toMatchObject({
        value: { kind: 'snapshot' },
        done: false,
      });
    });

    describe('once it has stopped after the snapshot', () => {
      let stopped: IteratorResult<JobRunStreamEvent> | undefined;

      beforeEach(async () => {
        await iterator.next();
        stopped = await iterator.return?.();
      });

      it('ends the stream, leaving the queued terminal event undelivered', () => {
        expect(stopped).toEqual({ value: undefined, done: true });
      });

      it('tears down idempotently when stopped again', async () => {
        await expect(iterator.return?.()).resolves.toEqual({
          value: undefined,
          done: true,
        });
      });

      describe('and an event emitted after teardown', () => {
        beforeEach(() => {
          fixture.events.emit({
            kind: 'log',
            correlationId,
            message: 'emitted after teardown',
            timestamp: 3_000,
          });
        });

        it('stays ended', async () => {
          await expect(iterator.next()).resolves.toEqual({
            value: undefined,
            done: true,
          });
        });

        it('reaches no listener that could fail', () => {
          expect(fixture.listenerErrors).not.toHaveBeenCalled();
        });
      });
    });
  });
});
