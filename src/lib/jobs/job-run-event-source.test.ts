import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobLogPayload, JobSnapshotPayload } from './contracts';
import { openJobRunEventSource } from './job-run-event-source';
import type {
  JobRunConnection,
  JobRunConnectionState,
} from './job-run-watch.svelte';

const correlationId = 'run-1';

/**
 * Stands in for the browser's server-sent-event connection, which the Node
 * test environment has no global for. Events and ready state are driven by
 * hand so a drop and a give-up can be told apart.
 */
class TestEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static readonly opened: TestEventSource[] = [];

  readonly url: string;
  readyState: number = TestEventSource.CONNECTING;
  closes = 0;
  readonly #listeners = new Map<
    string,
    ((event: MessageEvent<string>) => void)[]
  >();

  constructor(url: string) {
    this.url = url;
    TestEventSource.opened.push(this);
  }

  addEventListener(
    kind: string,
    listener: (event: MessageEvent<string>) => void,
  ): void {
    const existing = this.#listeners.get(kind);
    if (existing) existing.push(listener);
    else this.#listeners.set(kind, [listener]);
  }

  close(): void {
    this.readyState = TestEventSource.CLOSED;
    this.closes += 1;
  }

  deliver(kind: string, data = ''): void {
    const listeners = this.#listeners.get(kind);
    if (!listeners) throw new Error(`Nothing listening for ${kind}`);
    for (const listener of listeners) {
      listener(new MessageEvent<string>(kind, { data }));
    }
  }
}

function open(id = correlationId): {
  connection: JobRunConnection;
  source: TestEventSource;
} {
  const connection = openJobRunEventSource(id);
  const source = TestEventSource.opened.at(-1);
  if (!source) throw new Error('No connection was opened');
  return { connection, source };
}

/** Opens a connection already reporting its state into the returned array. */
function watched(): {
  source: TestEventSource;
  states: JobRunConnectionState[];
} {
  const { connection, source } = open();
  const states: JobRunConnectionState[] = [];
  connection.onState((state) => states.push(state));
  return { source, states };
}

function snapshot(): JobSnapshotPayload {
  return {
    correlation_id: correlationId,
    status: 'running',
    files_done: 1,
    files_total: 4,
    current_file: '/logs/claude/a.jsonl',
    error: null,
    timestamp: 1_000,
  };
}

beforeEach(() => {
  TestEventSource.opened.length = 0;
  vi.stubGlobal('EventSource', TestEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openJobRunEventSource', () => {
  it('connects to the event stream for the Job run it was given', () => {
    expect(open('run-1').source.url).toEqual('/api/jobs/run-1/events');
  });

  it('escapes a correlation id that would otherwise reshape the path', () => {
    expect(open('../settings?x=1').source.url).toEqual(
      '/api/jobs/..%2Fsettings%3Fx%3D1/events',
    );
  });

  it('reports the connection live once the stream opens', () => {
    const { source, states } = watched();

    source.readyState = TestEventSource.OPEN;
    source.deliver('open');

    expect(states).toEqual(['live']);
  });

  it('describes a connection the browser is retrying as dropped', () => {
    const { source, states } = watched();

    source.readyState = TestEventSource.CONNECTING;
    source.deliver('error');

    expect(states).toEqual(['dropped']);
  });

  it('describes a connection the browser has given up on as closed', () => {
    const { source, states } = watched();

    source.readyState = TestEventSource.CLOSED;
    source.deliver('error');

    expect(states).toEqual(['closed']);
  });

  it('reads the ready state afresh for each error', () => {
    // One error event covers both outcomes, so a retried drop followed by a
    // give-up has to be reported from the state each arrived in.
    const { source, states } = watched();

    source.readyState = TestEventSource.CONNECTING;
    source.deliver('error');
    source.readyState = TestEventSource.CLOSED;
    source.deliver('error');

    expect(states).toEqual(['dropped', 'closed']);
  });

  it('drops states that arrive before anything has subscribed', () => {
    // The reporting callback is assigned after the listeners are attached, so
    // this silent window is a property of the connection, not an accident of
    // how fast a caller subscribes.
    const { connection, source } = open();
    source.readyState = TestEventSource.OPEN;
    source.deliver('open');

    const states: JobRunConnectionState[] = [];
    connection.onState((state) => states.push(state));
    source.readyState = TestEventSource.CLOSED;
    source.deliver('error');

    expect(states).toEqual(['closed']);
  });

  it('reports to the latest state subscriber only', () => {
    const { connection, source } = open();
    const first: JobRunConnectionState[] = [];
    const second: JobRunConnectionState[] = [];
    connection.onState((state) => first.push(state));
    connection.onState((state) => second.push(state));

    source.deliver('open');

    expect(first).toEqual([]);
    expect(second).toEqual(['live']);
  });

  it('hands a subscriber the payload decoded from its frame', () => {
    const { connection, source } = open();
    const received: JobSnapshotPayload[] = [];
    connection.subscribe('snapshot', (payload) => received.push(payload));

    source.deliver('snapshot', JSON.stringify(snapshot()));

    expect(received).toEqual([snapshot()]);
  });

  it('delivers each event only to the kind that subscribed to it', () => {
    const log: JobLogPayload = {
      correlation_id: correlationId,
      message: 'Found 4 Claude session files',
      timestamp: 2_000,
    };
    const { connection, source } = open();
    const snapshots: JobSnapshotPayload[] = [];
    const logs: JobLogPayload[] = [];
    connection.subscribe('snapshot', (payload) => snapshots.push(payload));
    connection.subscribe('log', (payload) => logs.push(payload));

    source.deliver('log', JSON.stringify(log));

    expect(logs).toEqual([log]);
    expect(snapshots).toEqual([]);
  });

  it('refuses a malformed frame rather than passing it on', () => {
    const { connection, source } = open();
    const received: JobLogPayload[] = [];
    connection.subscribe('log', (payload) => received.push(payload));

    expect(() => source.deliver('log', 'not json')).toThrow(SyntaxError);
    expect(received).toEqual([]);
  });

  it('closes the underlying stream when the caller closes', () => {
    const { connection, source } = open();

    connection.close();

    expect(source.closes).toEqual(1);
    expect(source.readyState).toEqual(TestEventSource.CLOSED);
  });
});
