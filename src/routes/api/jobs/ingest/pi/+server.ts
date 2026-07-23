import { bootstrap } from '$lib/server/bootstrap';
import { createPiIngestJob } from '$lib/server/jobs/pi-ingest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
  const correlationId = bootstrap.dispatcher.dispatch(createPiIngestJob());
  return json({ correlation_id: correlationId }, { status: 202 });
};
