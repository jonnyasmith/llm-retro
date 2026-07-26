import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../database/connection';
import { checkpoints, interactions, jobRuns } from '../database/schema';
import { JobDispatcher, reconcileInterruptedJobRuns } from './dispatcher';
import { JobEventSource, type JobDoneEvent } from './events';
import { createStubJob, stubJobHandler } from './stub-job';
import { InProcessJobBackend, type Job, type JobHandler } from './types';

const temporaryDirectories: string[] = [];

async function createFixture() {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-jobs-'));
  temporaryDirectories.push(dataDirectory);
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  const listenerErrors = vi.fn();
  const events = new JobEventSource({ onListenerError: listenerErrors });
  const backend = new InProcessJobBackend(connection.database);
  backend.registerScoped('stub', stubJobHandler);
  const dispatcher = new JobDispatcher(connection.database, events, {
    backend,
  });
  return {
    ...connection,
    dataDirectory,
    backend,
    dispatcher,
    events,
    listenerErrors,
    waitForTerminal(correlationId: string): Promise<JobDoneEvent> {
      const terminal = events
        .history(correlationId)
        .find((event): event is JobDoneEvent => event.kind === 'done');
      if (terminal) return Promise.resolve(terminal);

      const { promise, resolve } = Promise.withResolvers<JobDoneEvent>();
      const unsubscribe = events.subscribe(
        correlationId,
        (event) => {
          if (event.kind !== 'done') return;
          unsubscribe();
          resolve(event);
        },
        false,
      );
      return promise;
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function controlledJob(
  type: string,
  scope: string | undefined,
): {
  job: Job;
  handler: JobHandler;
  started: Promise<void>;
  hasStarted: () => boolean;
  release: () => void;
} {
  const start = deferred();
  const gate = deferred();
  let hasStarted = false;
  return {
    job: {
      identity: { type, scope },
      payload: null,
    },
    handler: {
      async run(_payload, context) {
        hasStarted = true;
        context.progress({ filesTotal: 1, filesDone: 0, currentFile: scope });
        start.resolve();
        await gate.promise;
        context.progress({ filesTotal: 1, filesDone: 1, currentFile: scope });
      },
    },
    started: start.promise,
    hasStarted: () => hasStarted,
    release: gate.resolve,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Job dispatcher contract', () => {
  it('migrates the constrained job_run history table into a fresh real database', async () => {
    const fixture = await createFixture();

    try {
      expect(
        fixture.unsafeSqlite
          .prepare("select name from sqlite_master where type = 'table'")
          .pluck()
          .all(),
      ).toContain('job_run');
      expect(() =>
        fixture.unsafeSqlite
          .prepare(
            `insert into job_run
              (type, scope, correlation_id, status, files_total, files_done)
             values (?, ?, ?, ?, ?, ?)`,
          )
          .run('stub', '', crypto.randomUUID(), 'cancelled', 0, 0),
      ).toThrow(/job_run_status_valid/);
      expect(() =>
        fixture.unsafeSqlite
          .prepare(
            `insert into job_run
              (type, scope, correlation_id, status, started_at, files_total, files_done)
             values (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('stub', '', crypto.randomUUID(), 'running', 1, 1, 2),
      ).toThrow(/job_run_progress_valid/);

      fixture.database
        .insert(jobRuns)
        .values({
          type: 'stub',
          scope: '',
          correlationId: crypto.randomUUID(),
          status: 'running',
          startedAt: 1,
        })
        .run();
      expect(() =>
        fixture.database
          .insert(jobRuns)
          .values({
            type: 'stub',
            scope: '',
            correlationId: crypto.randomUUID(),
            status: 'running',
            startedAt: 2,
          })
          .run(),
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      fixture.close();
    }
  });

  it('reports started or joined, reuses an in-flight identity, and overlaps distinct identities', async () => {
    const fixture = await createFixture();
    const first = controlledJob('controlled-first', undefined);
    const second = controlledJob('controlled-second', 'second');

    try {
      fixture.backend.register('controlled-first', first.handler);
      fixture.backend.register(
        { type: 'controlled-second', scope: 'second' },
        second.handler,
      );
      const started = fixture.dispatcher.dispatch(first.job);
      const duplicate = fixture.dispatcher.dispatch({
        ...first.job,
        identity: { type: 'controlled-first', scope: '' },
      });
      const other = fixture.dispatcher.dispatch(second.job);

      expect(started.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(started.disposition).toBe('started');
      expect(duplicate).toEqual({
        correlationId: started.correlationId,
        disposition: 'joined',
      });
      expect(other.disposition).toBe('started');
      expect(other.correlationId).not.toBe(started.correlationId);
      expect(first.hasStarted()).toBe(false);
      expect(second.hasStarted()).toBe(false);

      await Promise.all([first.started, second.started]);
      expect(
        fixture.database
          .select()
          .from(jobRuns)
          .all()
          .filter(({ status }) => status === 'running'),
      ).toHaveLength(2);

      first.release();
      second.release();
      await Promise.all([
        fixture.waitForTerminal(started.correlationId),
        fixture.waitForTerminal(other.correlationId),
      ]);
    } finally {
      fixture.close();
    }
  });

  it('joins a run the database still calls running, and starts afresh once it is reconciled', async () => {
    const fixture = await createFixture();
    const orphaned = crypto.randomUUID();
    const job = controlledJob('orphaned', 'previous-process');

    try {
      fixture.backend.register(
        { type: 'orphaned', scope: 'previous-process' },
        job.handler,
      );
      fixture.database
        .insert(jobRuns)
        .values({
          type: 'orphaned',
          scope: 'previous-process',
          correlationId: orphaned,
          status: 'running',
          startedAt: 100,
        })
        .run();

      expect(fixture.dispatcher.dispatch(job.job)).toEqual({
        correlationId: orphaned,
        disposition: 'joined',
      });
      await Promise.resolve();
      expect(job.hasStarted()).toBe(false);

      expect(reconcileInterruptedJobRuns(fixture.database, () => 200)).toBe(1);
      const restarted = fixture.dispatcher.dispatch(job.job);

      expect(restarted.disposition).toBe('started');
      expect(restarted.correlationId).not.toBe(orphaned);

      await job.started;
      job.release();
      await fixture.waitForTerminal(restarted.correlationId);
    } finally {
      fixture.close();
    }
  });

  it('persists success and failure outcomes and emits replayable correlation-keyed events', async () => {
    const fixture = await createFixture();

    try {
      fixture.backend.register(
        { type: 'success', scope: 'one' },
        {
          async run(_payload, context) {
            context.log('started');
            context.progress({
              filesTotal: 2,
              filesDone: 1,
              currentFile: '/logs/one.jsonl',
            });
            context.progress({ filesTotal: 2, filesDone: 2 });
          },
        },
      );
      fixture.backend.register('failure', {
        async run() {
          throw new Error('deliberate failure');
        },
      });
      const { correlationId: successId } = fixture.dispatcher.dispatch({
        identity: { type: 'success', scope: 'one' },
        payload: null,
      });
      const delivered = vi.fn();
      fixture.events.subscribe(successId, () => {
        throw new Error('observer disconnected');
      });
      fixture.events.subscribe(successId, delivered);
      const { correlationId: failureId } = fixture.dispatcher.dispatch({
        identity: { type: 'failure' },
        payload: null,
      });

      await Promise.all([
        fixture.waitForTerminal(successId),
        fixture.waitForTerminal(failureId),
      ]);

      expect(
        fixture.database
          .select()
          .from(jobRuns)
          .all()
          .find(({ correlationId }) => correlationId === successId),
      ).toMatchObject({
        status: 'succeeded',
        filesTotal: 2,
        filesDone: 2,
        error: null,
      });
      expect(fixture.listenerErrors).toHaveBeenCalled();
      expect(delivered).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'done', status: 'succeeded' }),
      );
      expect(
        fixture.database
          .select()
          .from(jobRuns)
          .all()
          .find(({ correlationId }) => correlationId === failureId),
      ).toMatchObject({
        status: 'failed',
        error: 'deliberate failure',
      });

      const replayed = fixture.events.history(successId);
      expect(replayed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'log',
            correlationId: successId,
            message: 'started',
          }),
          expect.objectContaining({
            kind: 'progress',
            correlationId: successId,
            currentFile: '/logs/one.jsonl',
          }),
          expect.objectContaining({
            kind: 'done',
            correlationId: successId,
            status: 'succeeded',
          }),
        ]),
      );
      const errorsBeforeReplay = fixture.listenerErrors.mock.calls.length;
      expect(() =>
        fixture.events.subscribe(successId, () => {
          throw new Error('replay observer disconnected');
        }),
      ).not.toThrow();
      expect(fixture.listenerErrors.mock.calls.length).toBeGreaterThan(
        errorsBeforeReplay,
      );
    } finally {
      fixture.close();
    }
  });

  it('bounds replay history per run and across completed runs', () => {
    const events = new JobEventSource({
      maxEventsPerRun: 2,
      maxCompletedRuns: 1,
      onListenerError: vi.fn(),
    });
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();

    for (const message of ['one', 'two', 'three']) {
      events.emit({
        kind: 'log',
        correlationId: firstId,
        message,
        timestamp: 1,
      });
    }
    expect(events.history(firstId)).toHaveLength(2);
    events.emit({
      kind: 'done',
      correlationId: firstId,
      status: 'succeeded',
      error: null,
      timestamp: 2,
    });
    events.emit({
      kind: 'done',
      correlationId: secondId,
      status: 'succeeded',
      error: null,
      timestamp: 3,
    });

    expect(events.history(firstId)).toHaveLength(0);
    expect(events.history(secondId)).toHaveLength(1);
  });

  it('reconciles orphaned running rows without auto-resuming them', async () => {
    const fixture = await createFixture();
    const correlationId = crypto.randomUUID();

    try {
      fixture.database
        .insert(jobRuns)
        .values({
          type: 'stub',
          scope: 'interrupted',
          correlationId,
          status: 'running',
          startedAt: 100,
          filesTotal: 3,
          filesDone: 1,
        })
        .run();

      expect(reconcileInterruptedJobRuns(fixture.database, () => 200)).toBe(1);
      expect(fixture.database.select().from(jobRuns).get()).toMatchObject({
        correlationId,
        status: 'interrupted',
        startedAt: 100,
        finishedAt: 200,
        filesDone: 1,
      });
      await Promise.resolve();
      expect(fixture.database.select().from(jobRuns).all()).toHaveLength(1);
    } finally {
      fixture.close();
    }
  });
});

describe('stub Job checkpoint contract', () => {
  it('resumes an interrupted snapshot, short-circuits unchanged files, and resets replacements', async () => {
    const fixture = await createFixture();
    const logPath = join(fixture.dataDirectory, 'session.jsonl');

    try {
      await writeFile(logPath, 'one\ntwo\npartial');
      const originalState = await stat(logPath);
      fixture.database
        .insert(checkpoints)
        .values({
          harness: 'codex',
          stableSessionId: 'session-1',
          lastCompleteRecordByteOffset: Buffer.byteLength('one\n'),
          fileSize: originalState.size,
          fileMtime: Math.trunc(originalState.mtimeMs),
        })
        .run();

      const interruptedId = crypto.randomUUID();
      fixture.database
        .insert(jobRuns)
        .values({
          type: 'stub',
          scope: 'codex:session-1',
          correlationId: interruptedId,
          status: 'running',
          startedAt: Date.now(),
        })
        .run();
      expect(reconcileInterruptedJobRuns(fixture.database)).toBe(1);
      expect(
        fixture.database
          .select()
          .from(jobRuns)
          .all()
          .find(({ correlationId }) => correlationId === interruptedId),
      ).toMatchObject({ status: 'interrupted' });

      const { correlationId: resumedId } = fixture.dispatcher.dispatch(
        createStubJob({
          harness: 'codex',
          stableSessionId: 'session-1',
          filePath: logPath,
        }),
      );
      await fixture.waitForTerminal(resumedId);
      expect(resumedId).not.toBe(interruptedId);
      expect(
        fixture.events.history(resumedId).filter(({ kind }) => kind === 'log'),
      ).toHaveLength(1);
      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        lastCompleteRecordByteOffset: Buffer.byteLength('one\ntwo\n'),
      });

      const { correlationId: unchangedId } = fixture.dispatcher.dispatch(
        createStubJob({
          harness: 'codex',
          stableSessionId: 'session-1',
          filePath: logPath,
        }),
      );
      await fixture.waitForTerminal(unchangedId);
      expect(
        fixture.events
          .history(unchangedId)
          .filter(({ kind }) => kind === 'log'),
      ).toHaveLength(0);

      const beforeLargerReplacement = await stat(logPath);
      await writeFile(logPath, 'replacement-one\nreplacement-two\n');
      await utimes(
        logPath,
        beforeLargerReplacement.atime,
        new Date(beforeLargerReplacement.mtimeMs + 2_000),
      );
      const { correlationId: largerReplacementId } =
        fixture.dispatcher.dispatch(
          createStubJob({
            harness: 'codex',
            stableSessionId: 'session-1',
            filePath: logPath,
          }),
        );
      await fixture.waitForTerminal(largerReplacementId);

      expect(
        fixture.events
          .history(largerReplacementId)
          .filter(({ kind }) => kind === 'log'),
      ).toHaveLength(2);

      const beforeShrink = await stat(logPath);
      await writeFile(logPath, 'new\n');
      await utimes(
        logPath,
        beforeShrink.atime,
        new Date(beforeShrink.mtimeMs + 2_000),
      );
      const { correlationId: shrunkId } = fixture.dispatcher.dispatch(
        createStubJob({
          harness: 'codex',
          stableSessionId: 'session-1',
          filePath: logPath,
        }),
      );
      await fixture.waitForTerminal(shrunkId);
      expect(
        fixture.events.history(shrunkId).filter(({ kind }) => kind === 'log'),
      ).toHaveLength(1);
      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        lastCompleteRecordByteOffset: Buffer.byteLength('new\n'),
        fileSize: Buffer.byteLength('new\n'),
      });
      expect(fixture.database.select().from(interactions).all()).toHaveLength(
        0,
      );
    } finally {
      fixture.close();
    }
  });
});
