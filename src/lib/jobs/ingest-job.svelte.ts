import type { Harness, JobRunSummary, JobTriggerPayload } from './contracts';
import { JobRunWatch, type OpenJobRunConnection } from './job-run-watch.svelte';

/**
 * The one effectful step starting an ingest needs. Injected rather than
 * imported so a test can drive a started run, a joined run and a rejection.
 */
export type TriggerIngest = () => Promise<JobTriggerPayload>;

/**
 * The Job run a Harness's section is being asked to watch, read off the
 * address bar.
 *
 * A link that names no Harness belongs to whichever section already lists the
 * run, so following one cannot open four streams at once.
 */
export function requestedRunId(
  parameters: URLSearchParams,
  harness: Harness,
  runs: readonly JobRunSummary[],
): string | null {
  const requestedHarness = parameters.get('harness');
  const requestedRun = parameters.get('run');
  if (requestedHarness === harness) return requestedRun;
  if (requestedHarness !== null) return null;
  return runs.some((run) => run.correlationId === requestedRun)
    ? requestedRun
    : null;
}

/**
 * One Harness's ingest section: the Job run it is watching, the trigger that
 * starts or joins one, and everything the screen reads off the two.
 */
export class IngestJob {
  readonly #trigger: TriggerIngest;
  readonly #open: OpenJobRunConnection;
  readonly #fallbackMessage: string;
  #run = $state<JobRunWatch | null>(null);
  #error = $state('');
  #triggering = $state(false);
  #joinedRunId = $state<string | null>(null);

  constructor(
    trigger: TriggerIngest,
    open: OpenJobRunConnection,
    fallbackMessage: string,
  ) {
    this.#trigger = trigger;
    this.#open = open;
    this.#fallbackMessage = fallbackMessage;
  }

  /** The Job run on screen, or null before one has been adopted. */
  get run(): JobRunWatch | null {
    return this.#run;
  }

  get error(): string {
    return this.#error;
  }

  /** True from the moment a trigger is posted until the server answers. */
  get triggering(): boolean {
    return this.#triggering;
  }

  get running(): boolean {
    return this.#run !== null && !this.#run.finished;
  }

  /** The run on screen was already in flight when this section asked for one. */
  get joined(): boolean {
    return (
      this.#joinedRunId !== null &&
      this.#joinedRunId === this.#run?.correlationId
    );
  }

  /** Whole percent of files done; a run with nothing to divide by reads zero. */
  get percentage(): number {
    const run = this.#run;
    if (run === null || run.filesTotal === 0) return 0;
    return Math.round((run.filesDone / run.filesTotal) * 100);
  }

  /**
   * What the stream is doing, in the words the screen shows. A drop is
   * retried for you; a close that arrives before the run finished is not.
   */
  get streamLabel(): string {
    const run = this.#run;
    if (run === null) return 'idle';
    if (run.connection === 'dropped') return 'dropped — retrying';
    if (run.connection === 'closed' && !run.finished)
      return 'closed — reload to reconnect';
    return run.connection;
  }

  /**
   * Starts an ingest, or joins the one already running, and watches whichever
   * it turns out to be. Resolves with the Job run adopted, or null when the
   * trigger was rejected — the reason is on `error`.
   */
  async trigger(): Promise<string | null> {
    this.#triggering = true;
    this.#error = '';
    try {
      const { correlation_id, disposition } = await this.#trigger();
      this.#joinedRunId = disposition === 'joined' ? correlation_id : null;
      this.follow(correlation_id);
      return correlation_id;
    } catch (cause) {
      // A failure with nothing legible to say gets this section's wording.
      const message = cause instanceof Error ? cause.message.trim() : '';
      this.#error = message || this.#fallbackMessage;
      return null;
    } finally {
      this.#triggering = false;
    }
  }

  /** Watches a Job run, leaving an already-watched one connected. */
  follow(correlationId: string): void {
    if (correlationId === this.#run?.correlationId) return;
    this.#run?.close();
    this.#run = new JobRunWatch(correlationId, this.#open);
  }

  close(): void {
    this.#run?.close();
  }
}
