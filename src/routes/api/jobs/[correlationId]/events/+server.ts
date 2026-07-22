import { bootstrap } from '$lib/server/bootstrap';
import { jobRuns, type JobRunStatus } from '$lib/server/database/schema';
import type { JobEvent, JobProgressEvent } from '$lib/server/jobs/events';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const terminalStatuses = new Set<JobRunStatus>([
  'succeeded',
  'failed',
  'interrupted',
]);

function isTerminalStatus(
  status: JobRunStatus,
): status is 'succeeded' | 'failed' | 'interrupted' {
  return terminalStatuses.has(status);
}

function serialise(event: JobEvent): string {
  const payload =
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
  const history = [...bootstrap.jobEvents.history(run.correlationId)];
  const latestProgress = history.findLast(
    (event): event is JobProgressEvent => event.kind === 'progress',
  );
  if (
    !latestProgress ||
    latestProgress.filesDone !== run.filesDone ||
    latestProgress.filesTotal !== run.filesTotal
  ) {
    history.unshift({
      kind: 'progress',
      correlationId: run.correlationId,
      filesDone: run.filesDone,
      filesTotal: run.filesTotal,
      timestamp: run.startedAt ?? Date.now(),
    });
  }

  const historyHasTerminal = history.some((event) => event.kind === 'done');
  if (isTerminalStatus(run.status) && !historyHasTerminal) {
    history.push({
      kind: 'done',
      correlationId: run.correlationId,
      status: run.status,
      error: run.error,
      timestamp: run.finishedAt ?? Date.now(),
    });
  }

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
      for (const event of history) send(event);
      if (closed) return;
      unsubscribe = bootstrap.jobEvents.subscribe(
        run.correlationId,
        send,
        false,
      );
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
