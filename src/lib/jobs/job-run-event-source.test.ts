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

function logLine(): JobLogPayload {
  return {
    correlation_id: correlationId,
    message: 'Found 4 Claude session files',
    timestamp: 2_000,
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
  let connection: JobRunConnection;
  let source: TestEventSource;
  let states: JobRunConnectionState[];

  beforeEach(() => {
    states = [];
    ({ connection, source } = open());
  });

  function watch(): void {
    connection.onState((state) => states.push(state));
  }

  describe('a connection nobody is watching', () => {
    it('connects to the event stream for the Job run it was given', () => {
      expect(source.url).toEqual('/api/jobs/run-1/events');
    });

    it('escapes a correlation id that would otherwise reshape the path', () => {
      expect(open('../settings?x=1').source.url).toEqual(
        '/api/jobs/..%2Fsettings%3Fx%3D1/events',
      );
    });

    it('drops a state change rather than holding it for a later watcher', () => {
      // The reporting callback is assigned after the listeners are attached,
      // so this silent window is a property of the connection, not an accident
      // of how fast a caller subscribes.
      source.readyState = TestEventSource.OPEN;
      source.deliver('open');

      watch();

      expect(states).toEqual([]);
    });

    it('reports the state changes that arrive once something watches', () => {
      source.readyState = TestEventSource.OPEN;
      source.deliver('open');
      watch();

      source.readyState = TestEventSource.CLOSED;
      source.deliver('error');

      expect(states).toEqual(['closed']);
    });
  });

  describe('a watched connection', () => {
    beforeEach(watch);

    it('reports itself live once the stream opens', () => {
      source.readyState = TestEventSource.OPEN;
      source.deliver('open');

      expect(states).toEqual(['live']);
    });

    it('reports to a later watcher', () => {
      const later: JobRunConnectionState[] = [];
      connection.onState((state) => later.push(state));

      source.deliver('open');

      expect(later).toEqual(['live']);
    });

    it('stops reporting to the watcher a later one replaced', () => {
      connection.onState(() => {});

      source.deliver('open');

      expect(states).toEqual([]);
    });
  });

  describe('a watched connection the browser has not given up on', () => {
    beforeEach(watch);

    it.each([TestEventSource.CONNECTING, TestEventSource.OPEN])(
      'describes an error as a drop while a retry is still possible',
      (readyState) => {
        source.readyState = readyState;

        source.deliver('error');

        expect(states).toEqual(['dropped']);
      },
    );
  });

  describe('a watched connection the browser has given up on', () => {
    beforeEach(() => {
      watch();
      source.readyState = TestEventSource.CLOSED;
    });

    it('describes the error as a close rather than a drop', () => {
      source.deliver('error');

      expect(states).toEqual(['closed']);
    });
  });

  describe('a watched connection that has already dropped', () => {
    beforeEach(() => {
      watch();
      source.readyState = TestEventSource.CONNECTING;
      source.deliver('error');
    });

    it('reports a give-up that follows, reading the ready state afresh', () => {
      // One error event covers both outcomes, so a give-up after a retry has
      // to be reported from the state that error arrived in.
      source.readyState = TestEventSource.CLOSED;
      source.deliver('error');

      expect(states).toEqual(['dropped', 'closed']);
    });
  });

  describe('a connection with a subscriber for each kind of frame', () => {
    let received: { snapshot: JobSnapshotPayload[]; log: JobLogPayload[] };

    beforeEach(() => {
      received = { snapshot: [], log: [] };
      connection.subscribe('snapshot', (payload) =>
        received.snapshot.push(payload),
      );
      connection.subscribe('log', (payload) => received.log.push(payload));
    });

    it.each([
      { kind: 'snapshot', payload: snapshot() },
      { kind: 'log', payload: logLine() },
    ] as const)(
      'hands a subscriber the payload decoded from its frame',
      ({ kind, payload }) => {
        source.deliver(kind, JSON.stringify(payload));

        expect(received[kind]).toEqual([payload]);
      },
    );

    it('withholds a frame from the subscribers of every other kind', () => {
      source.deliver('log', JSON.stringify(logLine()));

      expect(received.snapshot).toEqual([]);
    });

    it('refuses a malformed frame rather than passing it on', () => {
      expect(() => source.deliver('log', 'not json')).toThrow(SyntaxError);
      expect(received.log).toEqual([]);
    });
  });

  describe('a connection with two subscribers to one kind of frame', () => {
    let first: JobLogPayload[];
    let second: JobLogPayload[];

    beforeEach(() => {
      first = [];
      second = [];
      connection.subscribe('log', (payload) => first.push(payload));
      connection.subscribe('log', (payload) => second.push(payload));
    });

    it('hands the frame to every subscriber, replacing none of them', () => {
      source.deliver('log', JSON.stringify(logLine()));

      expect(first).toEqual([logLine()]);
      expect(second).toEqual([logLine()]);
    });
  });

  describe('a closed connection', () => {
    let logs: JobLogPayload[];

    beforeEach(() => {
      watch();
      logs = [];
      connection.subscribe('log', (payload) => logs.push(payload));
      connection.close();
    });

    it('closes the underlying stream', () => {
      expect(source.closes).toEqual(1);
      expect(source.readyState).toEqual(TestEventSource.CLOSED);
    });

    it('says nothing to its watcher about the close it was asked for', () => {
      expect(states).toEqual([]);
    });

    it('keeps its subscribers, the stream being the whole of its teardown', () => {
      // Closing the stream is what stops delivery in a browser, so there is
      // nothing for the connection to detach on its own account.
      source.deliver('log', JSON.stringify(logLine()));

      expect(logs).toEqual([logLine()]);
    });
  });
});
