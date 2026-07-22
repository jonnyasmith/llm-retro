import type { JobProgress } from './types';

interface JobEventBase {
  correlationId: string;
  timestamp: number;
}

export interface JobProgressEvent extends JobEventBase, JobProgress {
  kind: 'progress';
}

export interface JobLogEvent extends JobEventBase {
  kind: 'log';
  message: string;
}

export interface JobDoneEvent extends JobEventBase {
  kind: 'done';
  status: 'succeeded' | 'failed' | 'interrupted';
  error: string | null;
}

export type JobEvent = JobProgressEvent | JobLogEvent | JobDoneEvent;
export type JobEventListener = (event: JobEvent) => void;

interface JobEventSourceOptions {
  maxEventsPerRun?: number;
  maxCompletedRuns?: number;
  onListenerError?: (cause: unknown, event: JobEvent) => void;
}

export class JobEventSource {
  readonly #history = new Map<string, JobEvent[]>();
  readonly #listeners = new Map<string, Set<JobEventListener>>();
  readonly #completed = new Set<string>();
  readonly #maxEventsPerRun: number;
  readonly #maxCompletedRuns: number;
  readonly #onListenerError: (cause: unknown, event: JobEvent) => void;

  constructor(options: JobEventSourceOptions = {}) {
    this.#maxEventsPerRun = options.maxEventsPerRun ?? 200;
    this.#maxCompletedRuns = options.maxCompletedRuns ?? 100;
    this.#onListenerError =
      options.onListenerError ??
      ((cause, event) => {
        console.error(
          `Job event listener failed for ${event.correlationId}`,
          cause,
        );
      });
  }

  emit(event: JobEvent): void {
    const history = this.#history.get(event.correlationId) ?? [];
    history.push(event);
    if (history.length > this.#maxEventsPerRun) history.shift();
    this.#history.set(event.correlationId, history);

    for (const listener of this.#listeners.get(event.correlationId) ?? []) {
      this.#deliver(listener, event);
    }

    if (event.kind === 'done') {
      this.#listeners.delete(event.correlationId);
      this.#completed.add(event.correlationId);
      while (this.#completed.size > this.#maxCompletedRuns) {
        const oldest = this.#completed.values().next().value;
        if (oldest === undefined) break;
        this.#completed.delete(oldest);
        this.#history.delete(oldest);
      }
    }
  }

  history(correlationId: string): readonly JobEvent[] {
    return [...(this.#history.get(correlationId) ?? [])];
  }

  subscribe(
    correlationId: string,
    listener: JobEventListener,
    replay = true,
  ): () => void {
    const replayed = replay ? this.history(correlationId) : [];
    if (replay) {
      for (const event of replayed) {
        this.#deliver(listener, event);
      }
    }
    if (replayed.some((event) => event.kind === 'done')) return () => {};

    const listeners = this.#listeners.get(correlationId) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(correlationId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(correlationId);
    };
  }

  waitForTerminal(correlationId: string): Promise<JobDoneEvent> {
    const terminal = this.history(correlationId).find(
      (event): event is JobDoneEvent => event.kind === 'done',
    );
    if (terminal) return Promise.resolve(terminal);

    return new Promise((resolve) => {
      const unsubscribe = this.subscribe(
        correlationId,
        (event) => {
          if (event.kind !== 'done') return;
          unsubscribe();
          resolve(event);
        },
        false,
      );
    });
  }

  #deliver(listener: JobEventListener, event: JobEvent): void {
    try {
      listener(event);
    } catch (cause) {
      this.#onListenerError(cause, event);
    }
  }
}
