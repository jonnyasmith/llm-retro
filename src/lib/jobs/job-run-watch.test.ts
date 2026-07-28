import { beforeEach, describe, expect, it } from 'vitest';
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
  let watch: JobRunWatch;
  let connection: TestConnection;

  beforeEach(() => {
    ({ watch, connection } = createWatch());
  });

  describe('a watch that has just been opened', () => {
    it('opens its connection for the Job run it was given', () => {
      expect(watch.correlationId).toBe(correlationId);
    });

    it('reports itself connecting', () => {
      expect(watch.connection).toBe('connecting');
    });

    it('has no outcome yet', () => {
      expect(watch.finished).toBe(false);
    });
  });

  describe('a watch receiving its first snapshot', () => {
    it('takes its status and progress from the snapshot', () => {
      connection.dispatch(
        'snapshot',
        snapshot({ status: 'running', files_done: 3, files_total: 7 }),
      );

      expect(watch.status).toBe('running');
      expect(watch.filesDone).toBe(3);
      expect(watch.filesTotal).toBe(7);
    });

    it('reports the connection live', () => {
      connection.dispatch('snapshot', snapshot());

      expect(watch.connection).toBe('live');
    });

    it('discards anything derived before it', () => {
      connection.dispatch('log', logLine('from a previous connection'));

      connection.dispatch('snapshot', snapshot());

      expect(watch.log).toEqual([]);
    });

    it('reports a Job run that had already finished when it connected', () => {
      connection.dispatch(
        'snapshot',
        snapshot({
          status: 'failed',
          files_done: 1,
          files_total: 2,
          error: 'no',
        }),
      );

      expect(watch.status).toBe('failed');
      expect(watch.error).toBe('no');
      expect(watch.filesDone).toBe(1);
    });
  });

  describe('a live watch', () => {
    beforeEach(() => {
      connection.dispatch('snapshot', snapshot({ files_total: 3 }));
    });

    it('accumulates log lines in the order they arrive', () => {
      connection.dispatch('log', logLine('one'));
      connection.dispatch(
        'progress',
        progress({ files_done: 1, files_total: 3, current_file: 'a.jsonl' }),
      );
      connection.dispatch('log', logLine('two'));

      expect(watch.log).toEqual(['one', 'two']);
    });

    it('takes the latest progress delta it is told', () => {
      connection.dispatch(
        'progress',
        progress({ files_done: 1, files_total: 3, current_file: 'a.jsonl' }),
      );
      connection.dispatch(
        'progress',
        progress({ files_done: 2, files_total: 3, current_file: 'b.jsonl' }),
      );

      expect(watch.filesDone).toBe(2);
      expect(watch.filesTotal).toBe(3);
      expect(watch.currentFile).toBe('b.jsonl');
    });

    it('keeps the last file it was told about when a delta carries none', () => {
      connection.dispatch(
        'progress',
        progress({ files_done: 0, files_total: 3, current_file: 'a.jsonl' }),
      );

      connection.dispatch(
        'progress',
        progress({ files_done: 1, files_total: 3 }),
      );

      expect(watch.currentFile).toBe('a.jsonl');
    });

    it('retains only the most recent lines once the log is full', () => {
      const emitted = jobRunLogRetention + 25;
      for (let index = 0; index < emitted; index += 1) {
        connection.dispatch('log', logLine(`line ${index}`));
      }

      expect(watch.log).toHaveLength(jobRunLogRetention);
      expect(watch.log.at(0)).toBe(`line ${emitted - jobRunLogRetention}`);
      expect(watch.log.at(-1)).toBe(`line ${emitted - 1}`);
    });
  });

  describe('a live watch receiving a further snapshot', () => {
    beforeEach(() => {
      connection.dispatch('snapshot', snapshot({ files_total: 4 }));
      connection.dispatch('log', logLine('reading a.jsonl'));
      connection.dispatch('log', logLine('reading b.jsonl'));
      connection.dispatch(
        'progress',
        progress({ files_done: 1, files_total: 4, current_file: 'a.jsonl' }),
      );
    });

    it('keeps only the lines the reconnect replayed after it', () => {
      connection.dispatch(
        'snapshot',
        snapshot({ files_done: 2, files_total: 4 }),
      );
      connection.dispatch('log', logLine('reading a.jsonl'));
      connection.dispatch('log', logLine('reading b.jsonl'));

      expect(watch.log).toEqual(['reading a.jsonl', 'reading b.jsonl']);
    });

    it('takes its progress from the newer snapshot', () => {
      connection.dispatch(
        'snapshot',
        snapshot({ files_done: 2, files_total: 4 }),
      );

      expect(watch.filesDone).toBe(2);
    });

    it('forgets the current file, which a snapshot cannot carry', () => {
      connection.dispatch(
        'snapshot',
        snapshot({ files_done: 2, files_total: 4 }),
      );

      expect(watch.currentFile).toBeNull();
    });
  });

  describe('a watch told the Job run is done', () => {
    beforeEach(() => {
      connection.dispatch('snapshot', snapshot({ files_total: 2 }));
      connection.dispatch(
        'progress',
        progress({ files_done: 2, files_total: 2, current_file: 'b.jsonl' }),
      );
    });

    it.each(['succeeded', 'failed', 'interrupted'] as const)(
      'takes %s as the outcome of the Job run',
      (status) => {
        connection.dispatch('done', done(status));

        expect(watch.status).toBe(status);
      },
    );

    it('reports itself finished', () => {
      connection.dispatch('done', done('succeeded'));

      expect(watch.finished).toBe(true);
    });

    it('closes its connection', () => {
      connection.dispatch('done', done('succeeded'));

      expect(watch.connection).toBe('closed');
      expect(connection.closes).toBe(1);
    });

    it('carries the error a failed Job run reported', () => {
      connection.dispatch('done', done('failed', 'no'));

      expect(watch.error).toBe('no');
    });

    it.each([
      { status: 'succeeded', wording: 'succeeded' },
      { status: 'interrupted', wording: 'was interrupted' },
    ] as const)(
      'leaves the error absent for a Job run that $wording',
      ({ status }) => {
        connection.dispatch('done', done(status));

        expect(watch.error).toBeNull();
      },
    );
  });

  describe('a watch whose connection dropped', () => {
    beforeEach(() => {
      connection.dispatch(
        'snapshot',
        snapshot({ files_done: 1, files_total: 4 }),
      );
      connection.report('dropped');
    });

    it('reports the drop', () => {
      expect(watch.connection).toBe('dropped');
    });

    it('is not finished by a drop, having no outcome', () => {
      expect(watch.finished).toBe(false);
    });

    it('returns to live on the next snapshot', () => {
      connection.dispatch(
        'snapshot',
        snapshot({ files_done: 3, files_total: 4 }),
      );

      expect(watch.connection).toBe('live');
    });

    it('takes the progress the reconnected snapshot carries', () => {
      connection.dispatch(
        'snapshot',
        snapshot({ files_done: 3, files_total: 4 }),
      );

      expect(watch.filesDone).toBe(3);
    });
  });

  describe('a watch whose connection failed outright', () => {
    beforeEach(() => {
      connection.dispatch('snapshot', snapshot());
      connection.report('closed');
    });

    it('reports the connection closed, without masquerading as a retry', () => {
      expect(watch.connection).toBe('closed');
    });

    it('is not finished by the failure, having no outcome', () => {
      expect(watch.finished).toBe(false);
    });
  });

  describe('a watch that has been closed', () => {
    beforeEach(() => {
      connection.dispatch(
        'snapshot',
        snapshot({ files_done: 1, files_total: 2 }),
      );
      watch.close();
    });

    it('reports the connection closed', () => {
      expect(watch.connection).toBe('closed');
    });

    it('closes its connection once, however many times it is asked', () => {
      watch.close();

      expect(connection.closes).toBe(1);
    });

    it('ignores log lines that arrive after it closed', () => {
      connection.dispatch('log', logLine('after close'));

      expect(watch.log).toEqual([]);
    });

    it('ignores progress that arrives after it closed', () => {
      connection.dispatch(
        'progress',
        progress({ files_done: 2, files_total: 2 }),
      );

      expect(watch.filesDone).toBe(1);
    });

    it('ignores a connection state reported after it closed', () => {
      connection.report('live');

      expect(watch.connection).toBe('closed');
    });
  });

  describe('a watch closed by a terminal event', () => {
    beforeEach(() => {
      connection.dispatch('snapshot', snapshot());
      connection.dispatch('done', done('succeeded'));
    });

    it('is safe to close again', () => {
      expect(() => watch.close()).not.toThrow();
    });

    it('closes its connection only once', () => {
      watch.close();

      expect(connection.closes).toBe(1);
    });

    it('remains finished', () => {
      expect(watch.finished).toBe(true);
    });
  });
});
