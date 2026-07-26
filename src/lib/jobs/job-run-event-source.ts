import { parseJobEventData } from './contracts';
import type {
  JobRunConnection,
  JobRunConnectionState,
  JobRunEventKind,
  JobRunEventPayloads,
} from './job-run-watch.svelte';

export function openJobRunEventSource(correlationId: string): JobRunConnection {
  const source = new EventSource(
    `/api/jobs/${encodeURIComponent(correlationId)}/events`,
  );
  let report: (state: JobRunConnectionState) => void = () => {};

  source.addEventListener('open', () => report('live'));
  // One error covers both a retryable drop and a fatal failure; only the ready
  // state tells them apart.
  source.addEventListener('error', () =>
    report(source.readyState === EventSource.CLOSED ? 'closed' : 'dropped'),
  );

  return {
    subscribe<Kind extends JobRunEventKind>(
      kind: Kind,
      listener: (payload: JobRunEventPayloads[Kind]) => void,
    ): void {
      source.addEventListener(kind, (event) =>
        listener(parseJobEventData(event as MessageEvent<string>)),
      );
    },
    onState(listener) {
      report = listener;
    },
    close() {
      source.close();
    },
  };
}
