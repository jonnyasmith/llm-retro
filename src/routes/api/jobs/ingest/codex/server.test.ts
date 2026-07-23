import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '$lib/server/jobs/types';

const dispatch = vi.hoisted(() =>
  vi.fn((_job: Job) => '33333333-3333-4333-8333-333333333333'),
);

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: { dispatcher: { dispatch } },
}));

import { POST } from './+server';

afterEach(() => dispatch.mockClear());

describe('Codex ingest trigger', () => {
  it('dispatches the harness-scoped Job and returns its in-flight correlation id', async () => {
    const request = new Request('http://localhost/api/jobs/ingest/codex', {
      method: 'POST',
    });

    const response = await POST({ request } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      correlation_id: '33333333-3333-4333-8333-333333333333',
    });
    expect(dispatch).toHaveBeenCalledWith({
      identity: { type: 'ingest', scope: 'codex' },
      payload: null,
    });
  });
});
