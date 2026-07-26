import { eq } from 'drizzle-orm';
import {
  isTerminalJobRunStatus,
  type JobRunStatus,
} from '../../jobs/contracts';
import type { Database } from '../database/connection';
import { jobRuns } from '../database/schema';
import type { JobEvent, JobEventSource, JobLogEvent } from './events';

export interface JobRunSnapshotEvent {
  kind: 'snapshot';
  correlationId: string;
  status: JobRunStatus;
  filesTotal: number;
  filesDone: number;
  currentFile: string | null;
  error: string | null;
  timestamp: number;
}

export type JobRunStreamEvent = JobRunSnapshotEvent | JobEvent;

export class JobRunStream {
  constructor(
    private readonly database: Database,
    private readonly events: JobEventSource,
  ) {}

  open(correlationId: string): AsyncIterable<JobRunStreamEvent> | undefined {
    const run = this.database
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.correlationId, correlationId))
      .get();
    if (!run) return undefined;

    const queued: JobRunStreamEvent[] = [
      {
        kind: 'snapshot',
        correlationId,
        status: run.status,
        filesTotal: run.filesTotal,
        filesDone: run.filesDone,
        // Never persisted, so a snapshot cannot know it (ADR-0012).
        currentFile: null,
        error: run.error,
        timestamp: Date.now(),
      },
      ...this.events
        .history(correlationId)
        .filter((event): event is JobLogEvent => event.kind === 'log'),
    ];
    if (isTerminalJobRunStatus(run.status)) {
      queued.push({
        kind: 'done',
        correlationId,
        status: run.status,
        error: run.error,
        timestamp: run.finishedAt ?? Date.now(),
      });
    }

    return this.#iterate(correlationId, queued);
  }

  #iterate(
    correlationId: string,
    queued: JobRunStreamEvent[],
  ): AsyncIterable<JobRunStreamEvent> {
    let wake: (() => void) | null = null;
    let ended = false;

    const unsubscribe = this.events.subscribe(
      correlationId,
      (event) => {
        queued.push(event);
        wake?.();
      },
      false,
    );
    const complete = (): IteratorResult<JobRunStreamEvent> => {
      if (!ended) {
        ended = true;
        unsubscribe();
        wake?.();
      }
      return { value: undefined, done: true };
    };

    const iterator: AsyncIterator<JobRunStreamEvent> = {
      async next() {
        while (!ended) {
          const event = queued.shift();
          if (event) {
            if (event.kind === 'done') complete();
            return { value: event, done: false };
          }
          const { promise, resolve } = Promise.withResolvers<void>();
          wake = resolve;
          await promise;
          wake = null;
        }
        return complete();
      },
      async return() {
        return complete();
      },
    };

    return { [Symbol.asyncIterator]: () => iterator };
  }
}
