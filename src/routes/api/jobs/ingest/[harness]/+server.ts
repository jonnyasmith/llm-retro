import { isHarness, type JobTriggerPayload } from '$lib/jobs/contracts';
import { bootstrap } from '$lib/server/bootstrap';
import { ingestJobIdentity } from '$lib/server/jobs/ingest-registry';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params }) => {
  if (!isHarness(params.harness)) error(404, 'Unknown Harness');

  const { correlationId, disposition } = bootstrap.dispatcher.dispatch({
    identity: ingestJobIdentity(params.harness),
    payload: null,
  });
  const payload: JobTriggerPayload = {
    correlation_id: correlationId,
    disposition,
  };
  return json(payload, { status: 202 });
};
