export const jobRunStatuses = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'interrupted',
] as const;

export const harnesses = ['claude', 'codex', 'pi', 'omp'] as const;

export type Harness = (typeof harnesses)[number];

export function isHarness(value: string): value is Harness {
  return harnesses.some((harness) => harness === value);
}

export const harnessLabels: Record<Harness, string> = {
  claude: 'Claude',
  codex: 'Codex',
  pi: 'pi',
  omp: 'omp',
};

export function mapHarnesses<Value>(
  mapper: (harness: Harness) => Value,
): Record<Harness, Value> {
  const [claude, codex, pi, omp] = harnesses;
  return {
    [claude]: mapper(claude),
    [codex]: mapper(codex),
    [pi]: mapper(pi),
    [omp]: mapper(omp),
  };
}

export type JobRunStatus = (typeof jobRunStatuses)[number];
export type TerminalJobRunStatus = Extract<
  JobRunStatus,
  'succeeded' | 'failed' | 'interrupted'
>;

export interface JobRunSummary {
  correlationId: string;
  status: JobRunStatus;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  filesTotal: number;
  filesDone: number;
}

export type JobDisposition = 'started' | 'joined';

export interface JobTriggerPayload {
  correlation_id: string;
  disposition: JobDisposition;
}

export interface JobSnapshotPayload {
  correlation_id: string;
  status: JobRunStatus;
  files_done: number;
  files_total: number;
  current_file: string | null;
  error: string | null;
  timestamp: number;
}

export interface JobProgressPayload {
  correlation_id: string;
  files_done: number;
  files_total: number;
  current_file: string | null;
  timestamp: number;
}

export interface JobLogPayload {
  correlation_id: string;
  message: string;
  timestamp: number;
}

export const jobRunLogRetention = 200;

export interface JobDonePayload {
  correlation_id: string;
  status: TerminalJobRunStatus;
  error: string | null;
  timestamp: number;
}

export function isTerminalJobRunStatus(
  status: string,
): status is TerminalJobRunStatus {
  return ['succeeded', 'failed', 'interrupted'].some(
    (terminal) => terminal === status,
  );
}

export function parseJobEventData<Payload>(
  event: MessageEvent<string>,
): Payload {
  return JSON.parse(event.data) as Payload;
}
