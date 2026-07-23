import { bootstrap } from '$lib/server/bootstrap';
import { createCodexIngestJob } from '$lib/server/jobs/codex-ingest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
  const correlationId = bootstrap.dispatcher.dispatch(createCodexIngestJob());
  return json({ correlation_id: correlationId }, { status: 202 });
};
