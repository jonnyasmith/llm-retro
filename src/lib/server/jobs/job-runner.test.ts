import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
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
import { checkpoints, interactions, jobRuns } from '../database/schema';
import {
  JobDispatcher,
  reconcileInterruptedJobRuns,
  type JobDispatch,
} from './dispatcher';
import { JobEventSource, type JobDoneEvent, type JobEvent } from './events';
import { createStubJob, stubJobHandler } from './stub-job';
import { InProcessJobBackend, type Job, type JobHandler } from './types';

const temporaryDirectories: string[] = [];

/** Fixtures the current test opened, closed once it has finished. */
const openFixtures: Fixture[] = [];

/** Gates of the controlled Jobs the current test left waiting. */
const gates: (() => void)[] = [];

/** Correlation ids the current test started, drained before the Store closes. */
const startedRuns: string[] = [];

/** Everything one test needs: a real Store, a dispatcher and its events. */
interface Fixture extends Connection {
  dataDirectory: string;
  backend: InProcessJobBackend;
  dispatcher: JobDispatcher;
  events: JobEventSource;
  listenerErrors: Mock<(cause: unknown, event: JobEvent) => void>;
  /** Resolves once the Job run reaches its terminal event. */
  waitForTerminal(correlationId: string): Promise<JobDoneEvent>;
}

/** The fixture the enclosing group arranged. */
let fixture!: Fixture;

async function createFixture(): Promise<Fixture> {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-jobs-'));
  temporaryDirectories.push(dataDirectory);
  const connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  const listenerErrors = vi.fn<(cause: unknown, event: JobEvent) => void>();
  const events = new JobEventSource({ onListenerError: listenerErrors });
  const backend = new InProcessJobBackend(connection.database);
  backend.registerScoped('stub', stubJobHandler);
  const dispatcher = new JobDispatcher(connection.database, events, {
    backend,
  });
  const opened: Fixture = {
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
  openFixtures.push(opened);
  return opened;
}

/**
 * Remembers a Job run so the teardown can let it reach its terminal event
 * before the Store closes underneath it.
 */
function trackRun(dispatch: JobDispatch): JobDispatch {
  if (dispatch.disposition === 'started') {
    startedRuns.push(dispatch.correlationId);
  }
  return dispatch;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

/** A Job whose handler starts on demand and blocks until it is released. */
interface ControlledJob {
  job: Job;
  handler: JobHandler;
  /** Resolves once the handler has begun. */
  started: Promise<void>;
  hasStarted: () => boolean;
  release: () => void;
}

function controlledJob(type: string, scope: string | undefined): ControlledJob {
  const start = deferred();
  const gate = deferred();
  let hasStarted = false;
  gates.push(gate.resolve);
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
  for (const release of gates.splice(0)) release();
  for (const opened of openFixtures.splice(0)) {
    await Promise.all(
      startedRuns.splice(0).map((id) => opened.waitForTerminal(id)),
    );
    opened.close();
  }
  startedRuns.length = 0;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Job dispatcher contract', () => {
  describe('a fresh real database', () => {
    beforeEach(async () => {
      fixture = await createFixture();
    });

    it('migrates the Job run history table into place', () => {
      expect(
        fixture.unsafeSqlite
          .prepare("select name from sqlite_master where type = 'table'")
          .pluck()
          .all(),
      ).toContain('job_run');
    });

    it('rejects a Job run whose status is outside the vocabulary', () => {
      expect(() =>
        fixture.unsafeSqlite
          .prepare(
            `insert into job_run
              (type, scope, correlation_id, status, files_total, files_done)
             values (?, ?, ?, ?, ?, ?)`,
          )
          .run('stub', '', crypto.randomUUID(), 'cancelled', 0, 0),
      ).toThrow(/job_run_status_valid/);
    });

    it('rejects a Job run reporting more files done than it has in total', () => {
      expect(() =>
        fixture.unsafeSqlite
          .prepare(
            `insert into job_run
              (type, scope, correlation_id, status, started_at, files_total, files_done)
             values (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('stub', '', crypto.randomUUID(), 'running', 1, 1, 2),
      ).toThrow(/job_run_progress_valid/);
    });

    describe('already holding a running Job run for an identity', () => {
      beforeEach(() => {
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
      });

      it('rejects a second running Job run for that identity', () => {
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
      });
    });
  });

  describe('an identity with no Job run', () => {
    let job: ControlledJob;

    beforeEach(async () => {
      fixture = await createFixture();
      job = controlledJob('controlled-first', undefined);
      fixture.backend.register('controlled-first', job.handler);
    });

    it('reports the dispatch as started', () => {
      expect(trackRun(fixture.dispatcher.dispatch(job.job)).disposition).toBe(
        'started',
      );
    });

    it('assigns the Job run a version 4 correlation id', () => {
      expect(
        trackRun(fixture.dispatcher.dispatch(job.job)).correlationId,
      ).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it.each([
      { description: 'an omitted scope', scope: undefined },
      { description: 'an explicit scope', scope: 'second' },
    ])(
      'defers the handler rather than running it during a dispatch with $description',
      ({ scope }) => {
        const deferredStart = controlledJob('controlled-deferred', scope);
        fixture.backend.register(
          { type: 'controlled-deferred', scope },
          deferredStart.handler,
        );

        trackRun(fixture.dispatcher.dispatch(deferredStart.job));

        expect(deferredStart.hasStarted()).toBe(false);
      },
    );
  });

  describe('an identity whose Job run is in flight', () => {
    let job: ControlledJob;
    let started: JobDispatch;

    beforeEach(async () => {
      fixture = await createFixture();
      job = controlledJob('controlled-first', undefined);
      fixture.backend.register('controlled-first', job.handler);
      started = trackRun(fixture.dispatcher.dispatch(job.job));
      await job.started;
    });

    it('joins a repeat dispatch to the correlation id already in flight', () => {
      expect(
        fixture.dispatcher.dispatch({
          ...job.job,
          identity: { type: 'controlled-first', scope: '' },
        }),
      ).toEqual({
        correlationId: started.correlationId,
        disposition: 'joined',
      });
    });
  });

  describe('two distinct identities dispatched together', () => {
    let first: ControlledJob;
    let second: ControlledJob;
    let started: JobDispatch;
    let other: JobDispatch;

    beforeEach(async () => {
      fixture = await createFixture();
      first = controlledJob('controlled-first', undefined);
      second = controlledJob('controlled-second', 'second');
      fixture.backend.register('controlled-first', first.handler);
      fixture.backend.register(
        { type: 'controlled-second', scope: 'second' },
        second.handler,
      );
      started = trackRun(fixture.dispatcher.dispatch(first.job));
      other = trackRun(fixture.dispatcher.dispatch(second.job));
    });

    it('starts the second identity rather than joining the first', () => {
      expect(other.disposition).toBe('started');
    });

    it('gives each Job run a correlation id of its own', () => {
      expect(other.correlationId).not.toBe(started.correlationId);
    });

    it('lets both Job runs be running at the same time', async () => {
      await Promise.all([first.started, second.started]);

      expect(
        fixture.database
          .select()
          .from(jobRuns)
          .all()
          .filter(({ status }) => status === 'running'),
      ).toHaveLength(2);
    });
  });

  describe('a Job run whose handler has succeeded', () => {
    let correlationId: string;
    let delivered = vi.fn();

    beforeEach(async () => {
      fixture = await createFixture();
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
      ({ correlationId } = trackRun(
        fixture.dispatcher.dispatch({
          identity: { type: 'success', scope: 'one' },
          payload: null,
        }),
      ));
      delivered = vi.fn();
      fixture.events.subscribe(correlationId, () => {
        throw new Error('observer disconnected');
      });
      fixture.events.subscribe(correlationId, delivered);
      await fixture.waitForTerminal(correlationId);
    });

    it('records the Job run as succeeded with its final progress and no error', () => {
      expect(
        fixture.database
          .select()
          .from(jobRuns)
          .all()
          .find((run) => run.correlationId === correlationId),
      ).toMatchObject({
        status: 'succeeded',
        filesTotal: 2,
        filesDone: 2,
        error: null,
      });
    });

    it('delivers the terminal event to the subscriber that was listening', () => {
      expect(delivered).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'done', status: 'succeeded' }),
      );
    });

    it('reports a subscriber that throws rather than letting it break delivery', () => {
      expect(fixture.listenerErrors).toHaveBeenCalled();
    });

    it('replays its log, progress and terminal events under the correlation id', () => {
      expect(fixture.events.history(correlationId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'log',
            correlationId,
            message: 'started',
          }),
          expect.objectContaining({
            kind: 'progress',
            correlationId,
            currentFile: '/logs/one.jsonl',
          }),
          expect.objectContaining({
            kind: 'done',
            correlationId,
            status: 'succeeded',
          }),
        ]),
      );
    });

    it('replays that history to a late subscriber without throwing at the caller', () => {
      expect(() =>
        fixture.events.subscribe(correlationId, () => {
          throw new Error('replay observer disconnected');
        }),
      ).not.toThrow();
    });

    it('reports a late subscriber that throws while the history replays', () => {
      const errorsBeforeReplay = fixture.listenerErrors.mock.calls.length;

      fixture.events.subscribe(correlationId, () => {
        throw new Error('replay observer disconnected');
      });

      expect(fixture.listenerErrors.mock.calls.length).toBeGreaterThan(
        errorsBeforeReplay,
      );
    });
  });

  describe('a Job run whose handler has thrown', () => {
    let correlationId: string;

    beforeEach(async () => {
      fixture = await createFixture();
      fixture.backend.register('failure', {
        async run() {
          throw new Error('deliberate failure');
        },
      });
      ({ correlationId } = trackRun(
        fixture.dispatcher.dispatch({
          identity: { type: 'failure' },
          payload: null,
        }),
      ));
      await fixture.waitForTerminal(correlationId);
    });

    it('records the Job run as failed with the message the handler threw', () => {
      expect(
        fixture.database
          .select()
          .from(jobRuns)
          .all()
          .find((run) => run.correlationId === correlationId),
      ).toMatchObject({
        status: 'failed',
        error: 'deliberate failure',
      });
    });
  });

  describe('a Job run the database still calls running', () => {
    let job: ControlledJob;
    let orphaned: string;

    beforeEach(async () => {
      fixture = await createFixture();
      orphaned = crypto.randomUUID();
      job = controlledJob('orphaned', 'previous-process');
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
          filesTotal: 3,
          filesDone: 1,
        })
        .run();
    });

    it('joins a dispatch to the correlation id the database is holding', () => {
      expect(fixture.dispatcher.dispatch(job.job)).toEqual({
        correlationId: orphaned,
        disposition: 'joined',
      });
    });

    it('leaves the handler unstarted', async () => {
      fixture.dispatcher.dispatch(job.job);

      await Promise.resolve();

      expect(job.hasStarted()).toBe(false);
    });

    it('counts the row it reconciles', () => {
      expect(reconcileInterruptedJobRuns(fixture.database, () => 200)).toBe(1);
    });

    it('marks the reconciled row interrupted', () => {
      reconcileInterruptedJobRuns(fixture.database, () => 200);

      expect(fixture.database.select().from(jobRuns).get()).toMatchObject({
        correlationId: orphaned,
        status: 'interrupted',
      });
    });

    it('stamps when the reconciled row finished without disturbing when it started', () => {
      reconcileInterruptedJobRuns(fixture.database, () => 200);

      expect(fixture.database.select().from(jobRuns).get()).toMatchObject({
        startedAt: 100,
        finishedAt: 200,
      });
    });

    it('preserves the progress the reconciled row had reached', () => {
      reconcileInterruptedJobRuns(fixture.database, () => 200);

      expect(fixture.database.select().from(jobRuns).get()).toMatchObject({
        filesDone: 1,
      });
    });

    it('does not auto-resume the reconciled row as a second Job run', async () => {
      reconcileInterruptedJobRuns(fixture.database, () => 200);

      await Promise.resolve();

      expect(fixture.database.select().from(jobRuns).all()).toHaveLength(1);
    });

    describe('once reconciliation has closed it', () => {
      let restarted: JobDispatch;

      beforeEach(() => {
        reconcileInterruptedJobRuns(fixture.database, () => 200);
        restarted = trackRun(fixture.dispatcher.dispatch(job.job));
      });

      it('starts the identity afresh', () => {
        expect(restarted.disposition).toBe('started');
      });

      it('gives the fresh Job run a correlation id of its own', () => {
        expect(restarted.correlationId).not.toBe(orphaned);
      });
    });
  });

  describe('a Job run event history at its retention bounds', () => {
    let events: JobEventSource;
    let firstId: string;
    let secondId: string;

    beforeEach(() => {
      events = new JobEventSource({
        maxEventsPerRun: 2,
        maxCompletedRuns: 1,
        onListenerError: vi.fn(),
      });
      firstId = crypto.randomUUID();
      secondId = crypto.randomUUID();
      for (const message of ['one', 'two', 'three']) {
        events.emit({
          kind: 'log',
          correlationId: firstId,
          message,
          timestamp: 1,
        });
      }
    });

    it('keeps only the most recent events of one Job run', () => {
      expect(events.history(firstId)).toHaveLength(2);
    });

    describe('once more Job runs have completed than it retains', () => {
      beforeEach(() => {
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
      });

      it('discards the history of the Job run that completed first', () => {
        expect(events.history(firstId)).toHaveLength(0);
      });

      it('keeps the history of the Job run that completed most recently', () => {
        expect(events.history(secondId)).toHaveLength(1);
      });
    });
  });
});

describe('stub Job checkpoint contract', () => {
  const session = { harness: 'codex', stableSessionId: 'session-1' } as const;

  /** Dispatches the stub Job over the log and waits for it to finish. */
  async function processLog(filePath: string): Promise<string> {
    const { correlationId } = trackRun(
      fixture.dispatcher.dispatch(createStubJob({ ...session, filePath })),
    );
    await fixture.waitForTerminal(correlationId);
    return correlationId;
  }

  function logEvents(correlationId: string) {
    return fixture.events
      .history(correlationId)
      .filter(({ kind }) => kind === 'log');
  }

  describe('a stub Job run the database still calls running', () => {
    let logPath: string;
    let interruptedId: string;

    beforeEach(async () => {
      fixture = await createFixture();
      logPath = join(fixture.dataDirectory, 'session.jsonl');
      await writeFile(logPath, 'one\ntwo\npartial');
      const originalState = await stat(logPath);
      fixture.database
        .insert(checkpoints)
        .values({
          ...session,
          lastCompleteRecordByteOffset: Buffer.byteLength('one\n'),
          fileSize: originalState.size,
          fileMtime: Math.trunc(originalState.mtimeMs),
        })
        .run();

      interruptedId = crypto.randomUUID();
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
    });

    it('counts the row it reconciles', () => {
      expect(reconcileInterruptedJobRuns(fixture.database)).toBe(1);
    });

    it('marks the row interrupted', () => {
      reconcileInterruptedJobRuns(fixture.database);

      expect(
        fixture.database
          .select()
          .from(jobRuns)
          .all()
          .find(({ correlationId }) => correlationId === interruptedId),
      ).toMatchObject({ status: 'interrupted' });
    });

    describe('once reconciliation has closed it', () => {
      let resumedId: string;

      beforeEach(async () => {
        reconcileInterruptedJobRuns(fixture.database);
        resumedId = await processLog(logPath);
      });

      it('resumes under a correlation id of its own', () => {
        expect(resumedId).not.toBe(interruptedId);
      });

      it('logs only the records the checkpoint had not already covered', () => {
        expect(logEvents(resumedId)).toHaveLength(1);
      });

      it('advances the checkpoint to the last complete record', () => {
        expect(fixture.database.select().from(checkpoints).get()).toMatchObject(
          {
            lastCompleteRecordByteOffset: Buffer.byteLength('one\ntwo\n'),
          },
        );
      });
    });
  });

  describe('a checkpoint that already covers its unchanged file', () => {
    let unchangedId: string;

    beforeEach(async () => {
      fixture = await createFixture();
      const logPath = join(fixture.dataDirectory, 'session.jsonl');
      await writeFile(logPath, 'one\ntwo\npartial');
      await processLog(logPath);
      unchangedId = await processLog(logPath);
    });

    it('logs nothing because no new record has arrived', () => {
      expect(logEvents(unchangedId)).toHaveLength(0);
    });
  });

  describe('a checkpoint whose file has since been replaced', () => {
    let logPath: string;

    beforeEach(async () => {
      fixture = await createFixture();
      logPath = join(fixture.dataDirectory, 'session.jsonl');
      await writeFile(logPath, 'one\ntwo\npartial');
      await processLog(logPath);
    });

    /** Overwrites the log with a newer file and processes it again. */
    async function replaceLog(contents: string): Promise<string> {
      const beforeReplacement = await stat(logPath);
      await writeFile(logPath, contents);
      await utimes(
        logPath,
        beforeReplacement.atime,
        new Date(beforeReplacement.mtimeMs + 2_000),
      );
      return processLog(logPath);
    }

    it.each([
      {
        description: 'a longer replacement',
        contents: 'replacement-one\nreplacement-two\n',
        records: 2,
      },
      { description: 'a shorter replacement', contents: 'new\n', records: 1 },
    ])(
      'reprocesses every complete record of $description',
      async ({ contents, records }) => {
        const replacementId = await replaceLog(contents);

        expect(logEvents(replacementId)).toHaveLength(records);
      },
    );

    it('resets the checkpoint to the offset and size of the replacement', async () => {
      await replaceLog('new\n');

      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        lastCompleteRecordByteOffset: Buffer.byteLength('new\n'),
        fileSize: Buffer.byteLength('new\n'),
      });
    });

    it('records no Interactions while it checkpoints', async () => {
      await replaceLog('new\n');

      expect(fixture.database.select().from(interactions).all()).toHaveLength(
        0,
      );
    });
  });
});
