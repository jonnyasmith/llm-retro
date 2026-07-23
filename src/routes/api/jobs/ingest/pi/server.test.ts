import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '$lib/server/jobs/types';

const dispatch = vi.hoisted(() =>
  vi.fn((_job: Job) => '22222222-2222-4222-8222-222222222222'),
);

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: { dispatcher: { dispatch } },
}));

import { POST } from './+server';

afterEach(() => dispatch.mockClear());

describe('pi ingest trigger', () => {
  it('dispatches the harness-scoped Job and returns its in-flight correlation id', async () => {
    const request = new Request('http://localhost/api/jobs/ingest/pi', {
      method: 'POST',
    });

    const response = await POST({ request } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      correlation_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(dispatch).toHaveBeenCalledWith({
      identity: { type: 'ingest', scope: 'pi' },
      payload: null,
    });
  });
});
