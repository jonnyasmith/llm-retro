import type { Harness, JobTriggerPayload } from './contracts';

export async function triggerIngest(
  harness: Harness,
): Promise<JobTriggerPayload> {
  const response = await fetch(
    `/api/jobs/ingest/${encodeURIComponent(harness)}`,
    { method: 'POST' },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as JobTriggerPayload;
}
