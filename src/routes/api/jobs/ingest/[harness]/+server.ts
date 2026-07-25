import { isHarness } from '$lib/jobs/contracts';
import { bootstrap } from '$lib/server/bootstrap';
import { ingestJobIdentity } from '$lib/server/jobs/ingest-registry';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params }) => {
  if (!isHarness(params.harness)) error(404, 'Unknown Harness');

  const correlationId = bootstrap.dispatcher.dispatch({
    identity: ingestJobIdentity(params.harness),
    payload: null,
  });
  return json({ correlation_id: correlationId }, { status: 202 });
};
