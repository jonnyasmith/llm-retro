import { describe, expect, it } from 'vitest';
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
  it('watches nothing until a run is adopted', () => {
    const { job } = createJob();

    expect(job.run).toBeNull();
    expect(job.running).toBe(false);
    expect(job.joined).toBe(false);
    expect(job.streamLabel).toBe('idle');
    expect(job.percentage).toBe(0);
  });

  it('watches the run the server started', async () => {
    const { job, connections } = createJob(() =>
      Promise.resolve(started('run-1')),
    );

    await expect(job.trigger()).resolves.toBe('run-1');

    expect(job.run?.correlationId).toBe('run-1');
    expect(job.joined).toBe(false);
    expect(connections.has('run-1')).toBe(true);
  });

  it('says so when the server handed back a run already in flight', async () => {
    const { job } = createJob(() =>
      Promise.resolve({ correlation_id: 'run-1', disposition: 'joined' }),
    );

    await job.trigger();

    expect(job.joined).toBe(true);
  });

  it('drops the joined disposition once a later run replaces it', async () => {
    const { job } = createJob(() =>
      Promise.resolve({ correlation_id: 'run-1', disposition: 'joined' }),
    );
    await job.trigger();

    job.follow('run-2');

    expect(job.joined).toBe(false);
  });

  it('stays in flight until the server answers', async () => {
    let answer: (payload: JobTriggerPayload) => void = () => {};
    const { job } = createJob(
      () =>
        new Promise<JobTriggerPayload>((resolve) => {
          answer = resolve;
        }),
    );

    const triggering = job.trigger();
    expect(job.triggering).toBe(true);

    answer(started('run-1'));
    await triggering;
    expect(job.triggering).toBe(false);
  });

  it('reports the words a rejected trigger came with', async () => {
    const { job } = createJob(() =>
      Promise.reject(new Error('Ingestion is already running')),
    );

    await expect(job.trigger()).resolves.toBeNull();

    expect(job.error).toBe('Ingestion is already running');
    expect(job.run).toBeNull();
    expect(job.triggering).toBe(false);
  });

  it('names itself when the trigger reports nothing legible', async () => {
    // The client throws blank for a failure it cannot describe, and a message
    // of only whitespace is no more legible than none.
    const { job } = createJob(() => Promise.reject(new Error('  ')));

    await expect(job.trigger()).resolves.toBeNull();

    expect(job.error).toBe(fallbackMessage);
  });

  it('names itself when the trigger rejects with no Error at all', async () => {
    let refuse: (cause: unknown) => void = () => {};
    const { job } = createJob(
      () =>
        new Promise<JobTriggerPayload>((_, reject) => {
          refuse = reject;
        }),
    );

    const triggering = job.trigger();
    refuse('a rejection that is not an Error');
    await triggering;

    expect(job.error).toBe(fallbackMessage);
  });

  it('clears the last failure when the next trigger begins', async () => {
    let attempts = 0;
    const { job } = createJob(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('Ingestion is already running'))
        : Promise.resolve(started('run-1'));
    });
    await job.trigger();

    await job.trigger();

    expect(job.error).toBe('');
  });

  it('leaves an already-watched run connected', () => {
    const { job, connections } = createJob();
    job.follow('run-1');

    job.follow('run-1');

    expect(connections.size).toBe(1);
    expect(connections.get('run-1')?.closes).toBe(0);
  });

  it('closes the run it leaves when it follows another', () => {
    const { job, connections } = createJob();
    job.follow('run-1');

    job.follow('run-2');

    expect(connections.get('run-1')?.closes).toBe(1);
    expect(job.run?.correlationId).toBe('run-2');
  });

  it('rounds progress to whole percent of the files reported', () => {
    const { job, connections } = createJob();
    job.follow('run-1');

    connections
      .get('run-1')
      ?.dispatch('snapshot', snapshot({ files_done: 1, files_total: 3 }));

    expect(job.percentage).toBe(33);
  });

  it('reads zero progress from a run with no files to divide by', () => {
    const { job, connections } = createJob();
    job.follow('run-1');

    connections
      .get('run-1')
      ?.dispatch('snapshot', snapshot({ files_done: 0, files_total: 0 }));

    expect(job.percentage).toBe(0);
  });

  it('says a dropped stream is being retried', () => {
    const { job, connections } = createJob();
    job.follow('run-1');

    connections.get('run-1')?.report('dropped');

    expect(job.streamLabel).toBe('dropped — retrying');
  });

  it('says a stream that closed mid-run needs a reload', () => {
    const { job, connections } = createJob();
    job.follow('run-1');

    connections.get('run-1')?.report('closed');

    expect(job.streamLabel).toBe('closed — reload to reconnect');
    expect(job.running).toBe(true);
  });

  it('names the stream state plainly once the run has finished', () => {
    const { job, connections } = createJob();
    job.follow('run-1');

    connections.get('run-1')?.dispatch('done', {
      correlation_id: 'run-1',
      status: 'succeeded',
      error: null,
      timestamp: 2_000,
    });

    expect(job.streamLabel).toBe('closed');
    expect(job.running).toBe(false);
  });

  it('closes the run it was watching when the screen goes away', () => {
    const { job, connections } = createJob();
    job.follow('run-1');

    job.close();

    expect(connections.get('run-1')?.closes).toBe(1);
  });
});
