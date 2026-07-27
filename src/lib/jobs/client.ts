import {
  isJobTriggerPayload,
  type Harness,
  type JobTriggerPayload,
} from './contracts';

/**
 * Asks the server to start an Ingestion of one Harness, or to hand back the
 * run already in flight.
 *
 * Throws blank on every failure: the endpoint answers a refusal in SvelteKit's
 * own words rather than in a shape agreed with this client, so there is
 * nothing it can repeat, and a body that will not decode or will not narrow
 * to a trigger answer is no more usable. The calling Harness section supplies
 * the wording. A fault in the request itself is nobody's to describe and is
 * rethrown.
 */
export async function triggerIngest(
  harness: Harness,
): Promise<JobTriggerPayload> {
  let response: Response;
  try {
    response = await fetch(`/api/jobs/ingest/${encodeURIComponent(harness)}`, {
      method: 'POST',
    });
  } catch (cause) {
    // `fetch` rejects with a TypeError when nothing answered it. Anything else
    // is a fault of this call rather than of the network.
    if (!(cause instanceof TypeError)) throw cause;
    throw new Error('', { cause });
  }
  if (!response.ok) throw new Error('');
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new Error('', { cause });
  }
  if (!isJobTriggerPayload(payload)) throw new Error('');
  return payload;
}
