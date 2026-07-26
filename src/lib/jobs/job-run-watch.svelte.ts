import {
  jobRunLogRetention,
  type JobDonePayload,
  type JobLogPayload,
  type JobProgressPayload,
  type JobRunStatus,
  type JobSnapshotPayload,
} from './contracts';

export interface JobRunEventPayloads {
  snapshot: JobSnapshotPayload;
  progress: JobProgressPayload;
  log: JobLogPayload;
  done: JobDonePayload;
}

export type JobRunEventKind = keyof JobRunEventPayloads;

export type JobRunConnectionState =
  'connecting' | 'live' | 'dropped' | 'closed';

export interface JobRunConnection {
  subscribe<Kind extends JobRunEventKind>(
    kind: Kind,
    listener: (payload: JobRunEventPayloads[Kind]) => void,
  ): void;
  onState(listener: (state: JobRunConnectionState) => void): void;
  close(): void;
}

export type OpenJobRunConnection = (correlationId: string) => JobRunConnection;

export class JobRunWatch {
  readonly correlationId: string;
  readonly #connection: JobRunConnection;
  #status = $state<JobRunStatus>('pending');
  #filesDone = $state(0);
  #filesTotal = $state(0);
  #currentFile = $state<string | null>(null);
  #error = $state<string | null>(null);
  #log = $state<string[]>([]);
  #connectionState = $state<JobRunConnectionState>('connecting');
  #finished = $state(false);
  #closed = false;

  constructor(correlationId: string, open: OpenJobRunConnection) {
    this.correlationId = correlationId;
    this.#connection = open(correlationId);
    this.#connection.onState((state) => {
      if (!this.#closed) this.#connectionState = state;
    });

    this.#on('snapshot', (payload) => {
      this.#status = payload.status;
      this.#filesDone = payload.files_done;
      this.#filesTotal = payload.files_total;
      this.#currentFile = payload.current_file;
      this.#error = payload.error;
      // Log lines replay on every connection, so a snapshot resets whatever
      // was derived before it (ADR-0012).
      this.#log = [];
      this.#connectionState = 'live';
    });

    this.#on('progress', (payload) => {
      this.#filesDone = payload.files_done;
      this.#filesTotal = payload.files_total;
      if (payload.current_file !== null)
        this.#currentFile = payload.current_file;
    });

    this.#on('log', (payload) => {
      this.#log.push(payload.message);
      if (this.#log.length > jobRunLogRetention) this.#log.shift();
    });

    this.#on('done', (payload) => {
      this.#status = payload.status;
      this.#error = payload.error;
      this.#finished = true;
      this.close();
    });
  }

  get status(): JobRunStatus {
    return this.#status;
  }

  get filesDone(): number {
    return this.#filesDone;
  }

  get filesTotal(): number {
    return this.#filesTotal;
  }

  get currentFile(): string | null {
    return this.#currentFile;
  }

  get error(): string | null {
    return this.#error;
  }

  get log(): readonly string[] {
    return this.#log;
  }

  get connection(): JobRunConnectionState {
    return this.#connectionState;
  }

  get finished(): boolean {
    return this.#finished;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#connectionState = 'closed';
    this.#connection.close();
  }

  #on<Kind extends JobRunEventKind>(
    kind: Kind,
    handle: (payload: JobRunEventPayloads[Kind]) => void,
  ): void {
    this.#connection.subscribe(kind, (payload) => {
      if (!this.#closed) handle(payload);
    });
  }
}
