import type {
  JobRunConnection,
  JobRunConnectionState,
  JobRunEventKind,
  JobRunEventPayloads,
} from './job-run-watch.svelte';

type JobRunEventListener = (
  payload: JobRunEventPayloads[JobRunEventKind],
) => void;

/**
 * A Job run stream a test drives by hand: it delivers exactly the events the
 * case dispatches, in the order it dispatches them, and records the closes.
 */
export class TestConnection implements JobRunConnection {
  closes = 0;
  readonly #listeners = new Map<JobRunEventKind, JobRunEventListener>();
  #state: ((state: JobRunConnectionState) => void) | null = null;

  subscribe<Kind extends JobRunEventKind>(
    kind: Kind,
    listener: (payload: JobRunEventPayloads[Kind]) => void,
  ): void {
    this.#listeners.set(kind, listener as JobRunEventListener);
  }

  onState(listener: (state: JobRunConnectionState) => void): void {
    this.#state = listener;
  }

  close(): void {
    this.closes += 1;
  }

  dispatch<Kind extends JobRunEventKind>(
    kind: Kind,
    payload: JobRunEventPayloads[Kind],
  ): void {
    const listener = this.#listeners.get(kind);
    if (!listener) throw new Error(`Nothing subscribed to ${kind}`);
    listener(payload);
  }

  report(state: JobRunConnectionState): void {
    if (!this.#state) throw new Error('Nothing subscribed to connection state');
    this.#state(state);
  }
}
