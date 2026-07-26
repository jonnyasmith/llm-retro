import { describe, expect, it } from 'vitest';
import {
  jobRunLogRetention,
  type JobDonePayload,
  type JobLogPayload,
  type JobProgressPayload,
  type JobSnapshotPayload,
  type TerminalJobRunStatus,
} from './contracts';
import { TestConnection } from './job-run-connection-fixture';
import { JobRunWatch } from './job-run-watch.svelte';

const correlationId = 'run-1';

function createWatch(): { watch: JobRunWatch; connection: TestConnection } {
  const connection = new TestConnection();
  const watch = new JobRunWatch(correlationId, (id) => {
    expect(id).toBe(correlationId);
    return connection;
  });
  return { watch, connection };
}

function snapshot(
  overrides: Partial<JobSnapshotPayload> = {},
): JobSnapshotPayload {
  return {
    correlation_id: correlationId,
    status: 'running',
    files_done: 0,
    files_total: 0,
    current_file: null,
    error: null,
    timestamp: 1_000,
    ...overrides,
  };
}

function progress(
  overrides: Partial<JobProgressPayload> = {},
): JobProgressPayload {
  return {
    correlation_id: correlationId,
    files_done: 0,
    files_total: 0,
    current_file: null,
    timestamp: 1_000,
    ...overrides,
  };
}

function logLine(message: string): JobLogPayload {
  return { correlation_id: correlationId, message, timestamp: 1_000 };
}

function done(
  status: TerminalJobRunStatus,
  error: string | null = null,
): JobDonePayload {
  return { correlation_id: correlationId, status, error, timestamp: 2_000 };
}

describe('JobRunWatch', () => {
  it('opens a connection for the run it was given', () => {
    const { watch } = createWatch();

    expect(watch.correlationId).toBe(correlationId);
    expect(watch.connection).toBe('connecting');
    expect(watch.finished).toBe(false);
  });

  it('takes its state from the snapshot and discards anything derived before it', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('log', logLine('from a previous connection'));

    connection.dispatch(
      'snapshot',
      snapshot({ status: 'running', files_done: 3, files_total: 7 }),
    );

    expect(watch.status).toBe('running');
    expect(watch.filesDone).toBe(3);
    expect(watch.filesTotal).toBe(7);
    expect(watch.log).toEqual([]);
    expect(watch.connection).toBe('live');
  });

  it('resets the derived view again when a reconnect replays log lines', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot({ files_total: 4 }));
    connection.dispatch('log', logLine('reading a.jsonl'));
    connection.dispatch('log', logLine('reading b.jsonl'));

    connection.dispatch(
      'snapshot',
      snapshot({ files_done: 2, files_total: 4 }),
    );
    connection.dispatch('log', logLine('reading a.jsonl'));
    connection.dispatch('log', logLine('reading b.jsonl'));

    expect(watch.log).toEqual(['reading a.jsonl', 'reading b.jsonl']);
    expect(watch.filesDone).toBe(2);
  });

  it('accumulates live progress and log deltas in order', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot({ files_total: 3 }));

    connection.dispatch('log', logLine('one'));
    connection.dispatch(
      'progress',
      progress({ files_done: 1, files_total: 3, current_file: 'a.jsonl' }),
    );
    connection.dispatch('log', logLine('two'));
    connection.dispatch(
      'progress',
      progress({ files_done: 2, files_total: 3, current_file: 'b.jsonl' }),
    );

    expect(watch.filesDone).toBe(2);
    expect(watch.filesTotal).toBe(3);
    expect(watch.currentFile).toBe('b.jsonl');
    expect(watch.log).toEqual(['one', 'two']);
  });

  it('keeps the last file it was told about when a delta carries none', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot({ files_total: 2 }));
    connection.dispatch(
      'progress',
      progress({ files_done: 0, files_total: 2, current_file: 'a.jsonl' }),
    );

    connection.dispatch(
      'progress',
      progress({ files_done: 1, files_total: 2 }),
    );

    expect(watch.currentFile).toBe('a.jsonl');
  });

  it('forgets the current file on a snapshot, which cannot carry one', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot({ files_total: 2 }));
    connection.dispatch(
      'progress',
      progress({ files_done: 1, files_total: 2, current_file: 'a.jsonl' }),
    );

    connection.dispatch(
      'snapshot',
      snapshot({ files_done: 1, files_total: 2 }),
    );

    expect(watch.currentFile).toBeNull();
  });

  it('exposes the outcome, closes the connection and reports itself finished', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot({ files_total: 2 }));
    connection.dispatch(
      'progress',
      progress({ files_done: 2, files_total: 2, current_file: 'b.jsonl' }),
    );

    connection.dispatch('done', done('succeeded'));

    expect(watch.status).toBe('succeeded');
    expect(watch.error).toBeNull();
    expect(watch.finished).toBe(true);
    expect(watch.connection).toBe('closed');
    expect(connection.closes).toBe(1);
  });

  it('handles a run that had already finished when it connected', () => {
    const { watch, connection } = createWatch();

    connection.dispatch(
      'snapshot',
      snapshot({
        status: 'failed',
        files_done: 1,
        files_total: 2,
        error: 'no',
      }),
    );
    connection.dispatch('done', done('failed', 'no'));

    expect(watch.status).toBe('failed');
    expect(watch.error).toBe('no');
    expect(watch.filesDone).toBe(1);
    expect(watch.finished).toBe(true);
  });

  it('distinguishes an interrupted run from a failed one', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot({ status: 'interrupted' }));

    connection.dispatch('done', done('interrupted'));

    expect(watch.status).toBe('interrupted');
    expect(watch.error).toBeNull();
    expect(watch.finished).toBe(true);
  });

  it('reports a dropped connection, and returns to live on the next snapshot', () => {
    const { watch, connection } = createWatch();
    connection.dispatch(
      'snapshot',
      snapshot({ files_done: 1, files_total: 4 }),
    );

    connection.report('dropped');
    expect(watch.connection).toBe('dropped');
    expect(watch.finished).toBe(false);

    connection.dispatch(
      'snapshot',
      snapshot({ files_done: 3, files_total: 4 }),
    );

    expect(watch.connection).toBe('live');
    expect(watch.filesDone).toBe(3);
  });

  it('reports a fatal connection failure without masquerading as a retry', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot());

    connection.report('closed');

    expect(watch.connection).toBe('closed');
    expect(watch.finished).toBe(false);
  });

  it('keeps the log bounded, retaining the most recent lines', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot());

    const emitted = jobRunLogRetention + 25;
    for (let index = 0; index < emitted; index += 1) {
      connection.dispatch('log', logLine(`line ${index}`));
    }

    expect(watch.log).toHaveLength(jobRunLogRetention);
    expect(watch.log.at(0)).toBe(`line ${emitted - jobRunLogRetention}`);
    expect(watch.log.at(-1)).toBe(`line ${emitted - 1}`);
  });

  it('closes once, however many times it is asked, and ignores later events', () => {
    const { watch, connection } = createWatch();
    connection.dispatch(
      'snapshot',
      snapshot({ files_done: 1, files_total: 2 }),
    );

    watch.close();
    watch.close();

    expect(connection.closes).toBe(1);
    expect(watch.connection).toBe('closed');

    connection.dispatch('log', logLine('after close'));
    connection.dispatch(
      'progress',
      progress({ files_done: 2, files_total: 2 }),
    );
    connection.report('live');

    expect(watch.log).toEqual([]);
    expect(watch.filesDone).toBe(1);
    expect(watch.connection).toBe('closed');
  });

  it('is still safe to close after a terminal event has closed it', () => {
    const { watch, connection } = createWatch();
    connection.dispatch('snapshot', snapshot());
    connection.dispatch('done', done('succeeded'));

    expect(() => watch.close()).not.toThrow();
    expect(connection.closes).toBe(1);
    expect(watch.finished).toBe(true);
  });
});
