import { bootstrap } from '$lib/server/bootstrap';
import { createOmpIngestJob } from '$lib/server/jobs/omp-ingest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
  const correlationId = bootstrap.dispatcher.dispatch(createOmpIngestJob());
  return json({ correlation_id: correlationId }, { status: 202 });
};
