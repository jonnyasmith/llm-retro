import type { Database } from '../database/connection';

export type JobPayload =
  | null
  | boolean
  | number
  | string
  | JobPayload[]
  | { [key: string]: JobPayload };

export interface JobIdentity {
  type: string;
  scope?: string | null;
}

export interface Job<Payload extends JobPayload = JobPayload> {
  identity: JobIdentity;
  payload: Payload;
}

export interface JobProgress {
  filesTotal: number;
  filesDone: number;
  currentFile?: string;
}

export interface JobContext {
  correlationId: string;
  database: Database;
  progress(progress: JobProgress): void;
  log(message: string): void;
}

export interface JobHandler<Payload extends JobPayload = JobPayload> {
  run(payload: Payload, context: JobContext): Promise<void>;
}

export interface JobExecutionObserver {
  correlationId: string;
  progress(progress: JobProgress): void;
  log(message: string): void;
}

export interface JobExecutionBackend {
  execute(job: Job, observer: JobExecutionObserver): Promise<void>;
}

export class InProcessJobBackend implements JobExecutionBackend {
  readonly #handlers = new Map<string, JobHandler>();
  readonly #scopedTypeHandlers = new Map<string, JobHandler>();

  constructor(private readonly database: Database) {}

  register<Payload extends JobPayload>(
    identity: string | JobIdentity,
    handler: JobHandler<Payload>,
  ): void {
    const key =
      typeof identity === 'string'
        ? JSON.stringify([identity, ''])
        : JSON.stringify([identity.type, identity.scope ?? '']);
    this.#handlers.set(key, handler as JobHandler);
  }

  registerScoped<Payload extends JobPayload>(
    type: string,
    handler: JobHandler<Payload>,
  ): void {
    this.#scopedTypeHandlers.set(type, handler as JobHandler);
  }

  execute(job: Job, observer: JobExecutionObserver): Promise<void> {
    const scope = job.identity.scope ?? '';
    const identityKey = JSON.stringify([job.identity.type, scope]);
    const handler =
      this.#handlers.get(identityKey) ??
      (scope.length > 0
        ? this.#scopedTypeHandlers.get(job.identity.type)
        : undefined);
    if (!handler) {
      throw new Error(`No handler registered for Job identity: ${identityKey}`);
    }

    return handler.run(job.payload, {
      correlationId: observer.correlationId,
      database: this.database,
      progress: observer.progress,
      log: observer.log,
    });
  }
}
