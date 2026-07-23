export const jobRunStatuses = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'interrupted',
] as const;

export const ingestHarnessLabels = {
  claude: 'Claude',
  codex: 'Codex',
  pi: 'pi',
  omp: 'omp',
} as const;

export type IngestHarness = keyof typeof ingestHarnessLabels;

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
