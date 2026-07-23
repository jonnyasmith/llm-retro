import { describe, expect, it, vi } from 'vitest';
import type { JobEventListener } from '$lib/server/jobs/events';

const correlationId = '11111111-1111-4111-8111-111111111111';
const run = vi.hoisted(() => ({
  correlationId: '11111111-1111-4111-8111-111111111111',
  status: 'running' as const,
  error: null,
  startedAt: 100,
  finishedAt: null,
  filesTotal: 2,
  filesDone: 1,
}));
const subscribe = vi.hoisted(() =>
  vi.fn((_id: string, listener: JobEventListener, replay = true) => {
    if (replay) {
      listener({
        kind: 'done',
        correlationId: '11111111-1111-4111-8111-111111111111',
        status: 'succeeded',
        error: null,
        timestamp: 200,
      });
    }
    return () => {};
  }),
);

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: {
    database: {
      select: () => ({
        from: () => ({
          where: () => ({ get: () => run }),
        }),
      }),
    },
    jobEvents: {
      history: () => [],
      subscribe,
    },
  },
}));

import { GET } from './+server';

describe('Job event stream', () => {
  it('atomically replays an event emitted at the subscription boundary', async () => {
    const response = await GET({
      params: { correlationId },
      request: new Request(`http://localhost/api/jobs/${correlationId}/events`),
    } as Parameters<typeof GET>[0]);

    await expect(response.text()).resolves.toContain(
      'event: done\ndata: {"correlation_id":"11111111-1111-4111-8111-111111111111","status":"succeeded"',
    );
    expect(subscribe).toHaveBeenCalledWith(correlationId, expect.any(Function));
  });
});
