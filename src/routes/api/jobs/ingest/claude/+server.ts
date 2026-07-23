import { bootstrap } from '$lib/server/bootstrap';
import { createClaudeIngestJob } from '$lib/server/jobs/claude-ingest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
  const correlationId = bootstrap.dispatcher.dispatch(createClaudeIngestJob());
  return json({ correlation_id: correlationId }, { status: 202 });
};
