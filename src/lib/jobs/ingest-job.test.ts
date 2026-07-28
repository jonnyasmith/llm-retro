import { beforeEach, describe, expect, it } from 'vitest';
import type {
  JobRunSummary,
  JobSnapshotPayload,
  JobTriggerPayload,
} from './contracts';
import {
  IngestJob,
  requestedRunId,
  type TriggerIngest,
} from './ingest-job.svelte';
import { TestConnection } from './job-run-connection-fixture';

const fallbackMessage = 'Unable to start Claude ingestion';

const unexpectedTrigger: TriggerIngest = () =>
  Promise.reject(new Error('This case triggers nothing'));

function createJob(trigger: TriggerIngest = unexpectedTrigger): {
  job: IngestJob;
  connections: Map<string, TestConnection>;
} {
  const connections = new Map<string, TestConnection>();
  const job = new IngestJob(
    trigger,
    (correlationId) => {
      const connection = new TestConnection();
      connections.set(correlationId, connection);
      return connection;
    },
    fallbackMessage,
  );
  return { job, connections };
}

function started(correlationId: string): JobTriggerPayload {
  return { correlation_id: correlationId, disposition: 'started' };
}

function joinedRun(correlationId: string): JobTriggerPayload {
  return { correlation_id: correlationId, disposition: 'joined' };
}

/**
 * The rejection escapes its executor because one of the cases specified here
 * rejects with something that is not an Error at all, which is precisely what
 * an executor's own `reject` may not be handed.
 */
function rejectingTrigger(cause: unknown): TriggerIngest {
  return () => {
    let refuse: (cause: unknown) => void = () => {};
    const rejected = new Promise<JobTriggerPayload>((_, reject) => {
      refuse = reject;
    });
    refuse(cause);
    return rejected;
  };
}

function snapshot(
  overrides: Partial<JobSnapshotPayload> = {},
): JobSnapshotPayload {
  return {
    correlation_id: 'run-1',
    status: 'running',
    files_done: 0,
    files_total: 0,
    current_file: null,
    error: null,
    timestamp: 1_000,
    ...overrides,
  };
}

function summary(correlationId: string): JobRunSummary {
  return {
    correlationId,
    status: 'succeeded',
    startedAt: 1_000,
    finishedAt: 2_000,
    error: null,
    filesTotal: 1,
    filesDone: 1,
  };
}

describe('requestedRunId', () => {
  it('takes the run a link names for this Harness', () => {
    const parameters = new URLSearchParams('harness=claude&run=run-1');

    expect(requestedRunId(parameters, 'claude', [])).toBe('run-1');
  });

  it('ignores a run a link names for another Harness', () => {
    const parameters = new URLSearchParams('harness=codex&run=run-1');

    expect(requestedRunId(parameters, 'claude', [summary('run-1')])).toBeNull();
  });

  it('claims an unqualified run this Harness already lists', () => {
    const parameters = new URLSearchParams('run=run-1');

    expect(requestedRunId(parameters, 'claude', [summary('run-1')])).toBe(
      'run-1',
    );
  });

  it('leaves an unqualified run this Harness never ran alone', () => {
    const parameters = new URLSearchParams('run=run-9');

    expect(requestedRunId(parameters, 'claude', [summary('run-1')])).toBeNull();
  });

  it('asks for nothing when the link names this Harness and no run', () => {
    const parameters = new URLSearchParams('harness=claude');

    expect(requestedRunId(parameters, 'claude', [summary('run-1')])).toBeNull();
  });
});

describe('IngestJob', () => {
  let job: IngestJob;
  let connections: Map<string, TestConnection>;

  describe('an ingest that has never triggered', () => {
    beforeEach(() => {
      ({ job, connections } = createJob());
    });

    it('watches no Job run', () => {
      expect(job.run).toBeNull();
    });

    it('is not running', () => {
      expect(job.running).toBe(false);
    });

    it('has joined nothing', () => {
      expect(job.joined).toBe(false);
    });

    it('reports its stream idle', () => {
      expect(job.streamLabel).toBe('idle');
    });

    it('reads no progress', () => {
      expect(job.percentage).toBe(0);
    });

    it('is not triggering', () => {
      expect(job.triggering).toBe(false);
    });

    it('has nothing to close when the screen goes away', () => {
      job.close();

      expect(connections.size).toBe(0);
    });
  });

  describe('an ingest whose trigger is in flight', () => {
    let answer: (payload: JobTriggerPayload) => void = () => {};
    let triggering: Promise<string | null>;

    beforeEach(() => {
      ({ job, connections } = createJob(
        () =>
          new Promise<JobTriggerPayload>((resolve) => {
            answer = resolve;
          }),
      ));
      triggering = job.trigger();
    });

    it('reports itself triggering', () => {
      expect(job.triggering).toBe(true);
    });

    it('has adopted no Job run yet', () => {
      expect(job.run).toBeNull();
    });

    it('stops triggering once the server answers', async () => {
      answer(started('run-1'));
      await triggering;

      expect(job.triggering).toBe(false);
    });
  });

  describe('an ingest watching a Job run the server started', () => {
    let adopted: string | null;

    beforeEach(async () => {
      ({ job, connections } = createJob(() =>
        Promise.resolve(started('run-1')),
      ));
      adopted = await job.trigger();
    });

    it('answers with the Job run it adopted', () => {
      expect(adopted).toBe('run-1');
    });

    it('watches that Job run', () => {
      expect(job.run?.correlationId).toBe('run-1');
    });

    it('opens a stream for it', () => {
      expect(connections.has('run-1')).toBe(true);
    });

    it('joined nothing, the run being its own', () => {
      expect(job.joined).toBe(false);
    });

    it('is running', () => {
      expect(job.running).toBe(true);
    });
  });

  describe('an ingest watching a Job run it joined', () => {
    beforeEach(async () => {
      ({ job, connections } = createJob(() =>
        Promise.resolve(joinedRun('run-1')),
      ));
      await job.trigger();
    });

    it('says the run was already in flight', () => {
      expect(job.joined).toBe(true);
    });

    it('still says so when told to follow the same run again', () => {
      job.follow('run-1');

      expect(job.joined).toBe(true);
    });

    it('drops the joined disposition once a later run replaces it', () => {
      job.follow('run-2');

      expect(job.joined).toBe(false);
    });
  });

  describe('an ingest whose trigger was rejected', () => {
    let adopted: string | null;

    beforeEach(async () => {
      let attempts = 0;
      ({ job, connections } = createJob(() => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error('Ingestion is already running'))
          : Promise.resolve(started('run-1'));
      }));
      adopted = await job.trigger();
    });

    it('answers with no Job run', () => {
      expect(adopted).toBeNull();
    });

    it('adopts no Job run', () => {
      expect(job.run).toBeNull();
    });

    it('stops triggering', () => {
      expect(job.triggering).toBe(false);
    });

    it('reports the words the rejection came with', () => {
      expect(job.error).toBe('Ingestion is already running');
    });

    it('clears the reported failure when the next trigger begins', async () => {
      await job.trigger();

      expect(job.error).toBe('');
    });
  });

  describe('an ingest whose trigger was rejected illegibly', () => {
    // The client throws blank for a failure it cannot describe, and a message
    // of only whitespace is no more legible than none.
    it.each([
      { cause: new Error('  ') },
      { cause: new Error('') },
      { cause: 'a rejection that is not an Error' },
    ])('names itself, having no reason to pass on', async ({ cause }) => {
      ({ job, connections } = createJob(rejectingTrigger(cause)));

      await expect(job.trigger()).resolves.toBeNull();

      expect(job.error).toBe(fallbackMessage);
    });
  });

  describe('an ingest watching a Job run', () => {
    beforeEach(() => {
      ({ job, connections } = createJob());
      job.follow('run-1');
    });

    it('watches the Job run it was named', () => {
      expect(job.run?.correlationId).toBe('run-1');
    });

    it('opens no second stream when told to follow the same run', () => {
      job.follow('run-1');

      expect(connections.size).toBe(1);
    });

    it('leaves the open stream alone when told to follow the same run', () => {
      job.follow('run-1');

      expect(connections.get('run-1')?.closes).toBe(0);
    });

    it('closes the stream it leaves when it follows another run', () => {
      job.follow('run-2');

      expect(connections.get('run-1')?.closes).toBe(1);
    });

    it('watches the newer Job run when it follows another', () => {
      job.follow('run-2');

      expect(job.run?.correlationId).toBe('run-2');
    });

    it('rounds progress to whole percent of the files reported', () => {
      connections
        .get('run-1')
        ?.dispatch('snapshot', snapshot({ files_done: 1, files_total: 3 }));

      expect(job.percentage).toBe(33);
    });

    it('reads zero progress from a run with no files to divide by', () => {
      connections
        .get('run-1')
        ?.dispatch('snapshot', snapshot({ files_done: 0, files_total: 0 }));

      expect(job.percentage).toBe(0);
    });

    it.each(['connecting', 'live'] as const)(
      'shows a stream state that needs no explaining in its own words',
      (state) => {
        connections.get('run-1')?.report(state);

        expect(job.streamLabel).toBe(state);
      },
    );

    describe('whose stream dropped', () => {
      beforeEach(() => {
        connections.get('run-1')?.report('dropped');
      });

      it('says the drop is being retried', () => {
        expect(job.streamLabel).toBe('dropped — retrying');
      });

      it('is still running, the Job run having no outcome', () => {
        expect(job.running).toBe(true);
      });
    });

    describe('whose stream closed before the Job run finished', () => {
      beforeEach(() => {
        connections.get('run-1')?.report('closed');
      });

      it('says a reload is needed to reconnect', () => {
        expect(job.streamLabel).toBe('closed — reload to reconnect');
      });

      it('is still running, the Job run having no outcome', () => {
        expect(job.running).toBe(true);
      });
    });

    describe('whose Job run has finished', () => {
      beforeEach(() => {
        connections.get('run-1')?.dispatch('done', {
          correlation_id: 'run-1',
          status: 'succeeded',
          error: null,
          timestamp: 2_000,
        });
      });

      it('names the close plainly, there being nothing to reconnect', () => {
        expect(job.streamLabel).toBe('closed');
      });

      it('is no longer running', () => {
        expect(job.running).toBe(false);
      });
    });

    describe('torn down with the screen', () => {
      beforeEach(() => {
        job.close();
      });

      it('closes the stream it was watching', () => {
        expect(connections.get('run-1')?.closes).toBe(1);
      });

      it('closes that stream once, however often it is torn down', () => {
        job.close();

        expect(connections.get('run-1')?.closes).toBe(1);
      });
    });
  });
});
