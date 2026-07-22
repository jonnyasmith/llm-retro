import { bootstrap } from '$lib/server/bootstrap';
import {
  isTerminalJobRunStatus,
  type JobDonePayload,
  type JobLogPayload,
  type JobProgressPayload,
} from '$lib/jobs/contracts';
import { jobRuns } from '$lib/server/database/schema';
import type { JobEvent, JobProgressEvent } from '$lib/server/jobs/events';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function serialise(event: JobEvent): string {
  const payload: JobProgressPayload | JobLogPayload | JobDonePayload =
    event.kind === 'progress'
      ? {
          correlation_id: event.correlationId,
          files_done: event.filesDone,
          files_total: event.filesTotal,
          current_file: event.currentFile ?? null,
          timestamp: event.timestamp,
        }
      : event.kind === 'log'
        ? {
            correlation_id: event.correlationId,
            message: event.message,
            timestamp: event.timestamp,
          }
        : {
            correlation_id: event.correlationId,
            status: event.status,
            error: event.error,
            timestamp: event.timestamp,
          };

  return `event: ${event.kind}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export const GET: RequestHandler = ({ params, request }) => {
  const run = bootstrap.database
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.correlationId, params.correlationId))
    .get();
  if (!run) error(404, 'Job run not found');

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      const cleanup = () => {
        if (closed) return;
        closed = true;
        request.signal.removeEventListener('abort', cleanup);
        unsubscribe();
      };
      const close = () => {
        if (closed) return;
        cleanup();
        controller.close();
      };
      const send = (event: JobEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(serialise(event)));
        if (event.kind === 'done') close();
      };

      request.signal.addEventListener('abort', cleanup, { once: true });
      if (request.signal.aborted) {
        cleanup();
        return;
      }
      unsubscribe = bootstrap.jobEvents.subscribe(run.correlationId, send);
      if (closed) return;
      const currentHistory = bootstrap.jobEvents.history(run.correlationId);
      const latestProgress = currentHistory.findLast(
        (event): event is JobProgressEvent => event.kind === 'progress',
      );
      if (
        !latestProgress ||
        latestProgress.filesDone !== run.filesDone ||
        latestProgress.filesTotal !== run.filesTotal
      ) {
        send({
          kind: 'progress',
          correlationId: run.correlationId,
          filesDone: run.filesDone,
          filesTotal: run.filesTotal,
          timestamp: run.startedAt ?? Date.now(),
        });
      }
      if (
        isTerminalJobRunStatus(run.status) &&
        !currentHistory.some((event) => event.kind === 'done')
      ) {
        send({
          kind: 'done',
          correlationId: run.correlationId,
          status: run.status,
          error: run.error,
          timestamp: run.finishedAt ?? Date.now(),
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    },
  });
};
