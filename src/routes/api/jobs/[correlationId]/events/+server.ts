import { bootstrap } from '$lib/server/bootstrap';
import type {
  JobDonePayload,
  JobLogPayload,
  JobProgressPayload,
  JobSnapshotPayload,
} from '$lib/jobs/contracts';
import type { JobRunStreamEvent } from '$lib/server/jobs/job-run-stream';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function serialise(event: JobRunStreamEvent): string {
  const payload:
    JobSnapshotPayload | JobProgressPayload | JobLogPayload | JobDonePayload =
    event.kind === 'snapshot'
      ? {
          correlation_id: event.correlationId,
          status: event.status,
          files_done: event.filesDone,
          files_total: event.filesTotal,
          current_file: event.currentFile,
          error: event.error,
          timestamp: event.timestamp,
        }
      : event.kind === 'progress'
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

export const GET: RequestHandler = ({ params }) => {
  const events = bootstrap.jobRunStream.open(params.correlationId);
  if (!events) error(404, 'Job run not found');

  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (closed) return;
      if (next.done) {
        closed = true;
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(serialise(next.value)));
    },
    async cancel() {
      closed = true;
      await iterator.return?.();
    },
  });

  return new Response(body, {
    headers: {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    },
  });
};
