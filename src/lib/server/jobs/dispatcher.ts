import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../database/connection';
import { jobRuns } from '../database/schema';
import { JobEventSource } from './events';
import {
  InProcessJobBackend,
  type Job,
  type JobExecutionBackend,
  type JobExecutionObserver,
  type JobIdentity,
  type JobProgress,
} from './types';

interface DispatcherOptions {
  backend?: JobExecutionBackend;
  clock?: () => number;
  createCorrelationId?: () => string;
}

interface NormalisedJobIdentity {
  type: string;
  scope: string;
}

export function normaliseJobIdentity(
  identity: JobIdentity,
): NormalisedJobIdentity {
  if (identity.type.length === 0) throw new Error('Job type cannot be empty');
  return { type: identity.type, scope: identity.scope ?? '' };
}

export function reconcileInterruptedJobRuns(
  database: Database,
  clock: () => number = Date.now,
): number {
  return database
    .update(jobRuns)
    .set({ status: 'interrupted', finishedAt: clock() })
    .where(eq(jobRuns.status, 'running'))
    .run().changes;
}

export class JobDispatcher {
  readonly #inFlight = new Map<string, string>();
  readonly #backend: JobExecutionBackend;
  readonly #clock: () => number;
  readonly #createCorrelationId: () => string;

  constructor(
    private readonly database: Database,
    readonly events = new JobEventSource(),
    options: DispatcherOptions = {},
  ) {
    this.#backend = options.backend ?? new InProcessJobBackend(database);
    this.#clock = options.clock ?? Date.now;
    this.#createCorrelationId = options.createCorrelationId ?? randomUUID;
  }

  dispatch(job: Job): string {
    const identity = normaliseJobIdentity(job.identity);
    const key = JSON.stringify([identity.type, identity.scope]);
    const localCorrelationId = this.#inFlight.get(key);
    if (localCorrelationId) return localCorrelationId;

    const persisted = this.database
      .select({ correlationId: jobRuns.correlationId })
      .from(jobRuns)
      .where(
        and(
          eq(jobRuns.type, identity.type),
          eq(jobRuns.scope, identity.scope),
          eq(jobRuns.status, 'running'),
        ),
      )
      .get();
    if (persisted) return persisted.correlationId;

    const correlationId = this.#createCorrelationId();
    const startedAt = this.#clock();
    this.database.transaction((transaction) => {
      transaction
        .insert(jobRuns)
        .values({
          ...identity,
          correlationId,
          status: 'pending',
          filesTotal: 0,
          filesDone: 0,
        })
        .run();
      transaction
        .update(jobRuns)
        .set({ status: 'running', startedAt })
        .where(eq(jobRuns.correlationId, correlationId))
        .run();
    });
    this.#inFlight.set(key, correlationId);

    queueMicrotask(() => {
      void this.#execute(job, key, correlationId);
    });
    return correlationId;
  }

  async #execute(job: Job, key: string, correlationId: string): Promise<void> {
    const observer: JobExecutionObserver = {
      correlationId,
      progress: (progress) => this.#recordProgress(correlationId, progress),
      log: (message) =>
        this.events.emit({
          kind: 'log',
          correlationId,
          message,
          timestamp: this.#clock(),
        }),
    };

    try {
      await this.#backend.execute(job, observer);
      this.#finish(correlationId, 'succeeded', null);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      this.#finish(correlationId, 'failed', error);
    } finally {
      if (this.#inFlight.get(key) === correlationId) this.#inFlight.delete(key);
    }
  }

  #recordProgress(correlationId: string, progress: JobProgress): void {
    if (
      !Number.isInteger(progress.filesTotal) ||
      !Number.isInteger(progress.filesDone) ||
      progress.filesTotal < 0 ||
      progress.filesDone < 0 ||
      progress.filesDone > progress.filesTotal
    ) {
      throw new Error(
        'Job progress counters must be valid non-negative integers',
      );
    }

    this.database
      .update(jobRuns)
      .set({
        filesTotal: progress.filesTotal,
        filesDone: progress.filesDone,
      })
      .where(eq(jobRuns.correlationId, correlationId))
      .run();
    this.events.emit({
      kind: 'progress',
      correlationId,
      ...progress,
      timestamp: this.#clock(),
    });
  }

  #finish(
    correlationId: string,
    status: 'succeeded' | 'failed',
    error: string | null,
  ): void {
    this.database
      .update(jobRuns)
      .set({ status, error, finishedAt: this.#clock() })
      .where(eq(jobRuns.correlationId, correlationId))
      .run();
    this.events.emit({
      kind: 'done',
      correlationId,
      status,
      error,
      timestamp: this.#clock(),
    });
  }
}
