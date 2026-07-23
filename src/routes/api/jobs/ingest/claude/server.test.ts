import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '$lib/server/jobs/types';

const dispatch = vi.hoisted(() =>
  vi.fn((_job: Job) => '11111111-1111-4111-8111-111111111111'),
);

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: { dispatcher: { dispatch } },
}));

import { POST } from './+server';

afterEach(() => dispatch.mockClear());

describe('Claude ingest trigger', () => {
  it('dispatches the harness-scoped Job and returns its in-flight correlation id', async () => {
    const request = () =>
      new Request('http://localhost/api/jobs/ingest/claude', {
        method: 'POST',
      });

    const first = await POST({ request: request() } as Parameters<
      typeof POST
    >[0]);
    const duplicate = await POST({ request: request() } as Parameters<
      typeof POST
    >[0]);

    expect(first.status).toBe(202);
    await expect(first.json()).resolves.toEqual({
      correlation_id: '11111111-1111-4111-8111-111111111111',
    });
    await expect(duplicate.json()).resolves.toEqual({
      correlation_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      identity: { type: 'ingest', scope: 'claude' },
      payload: null,
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      identity: { type: 'ingest', scope: 'claude' },
      payload: null,
    });
  });
});
