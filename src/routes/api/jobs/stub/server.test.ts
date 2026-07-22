import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '$lib/server/jobs/types';

const dispatchedJobs = vi.hoisted(() => [] as Job[]);

vi.mock('node:fs/promises', () => ({ writeFile: vi.fn() }));

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: {
    databasePath: '/tmp/llm-retro-stub-route-test/database.sqlite',
    dispatcher: {
      dispatch(job: Job) {
        dispatchedJobs.push(job);
        return crypto.randomUUID();
      },
    },
  },
}));

import { POST } from './+server';

afterEach(() => {
  dispatchedJobs.length = 0;
});

describe('stub Job trigger', () => {
  it('starts each browser demo with a fresh checkpoint identity', async () => {
    const request = () =>
      new Request('http://localhost/api/jobs/stub', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

    await POST({ request: request() } as Parameters<typeof POST>[0]);
    await POST({ request: request() } as Parameters<typeof POST>[0]);

    expect(dispatchedJobs).toHaveLength(2);
    expect(dispatchedJobs[0]?.identity.scope).not.toBe(
      dispatchedJobs[1]?.identity.scope,
    );
  });
});
