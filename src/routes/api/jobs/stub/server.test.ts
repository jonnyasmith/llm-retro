import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobDisposition } from '$lib/jobs/contracts';
import type { JobDispatch } from '$lib/server/jobs/dispatcher';
import type { Job } from '$lib/server/jobs/types';

const dispatcher = vi.hoisted<{
  jobs: Job[];
  correlationIds: string[];
  disposition: JobDisposition;
}>(() => ({ jobs: [], correlationIds: [], disposition: 'started' }));

vi.mock('node:fs/promises', () => ({ writeFile: vi.fn() }));

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: {
    databasePath: '/tmp/llm-retro-stub-route-test/database.sqlite',
    dispatcher: {
      dispatch(job: Job): JobDispatch {
        const correlationId = crypto.randomUUID();
        dispatcher.jobs.push(job);
        dispatcher.correlationIds.push(correlationId);
        return { correlationId, disposition: dispatcher.disposition };
      },
    },
  },
}));

import { POST } from './+server';

const trigger = () =>
  POST({
    request: new Request('http://localhost/api/jobs/stub', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  } as Parameters<typeof POST>[0]);

afterEach(() => {
  dispatcher.jobs.length = 0;
  dispatcher.correlationIds.length = 0;
  dispatcher.disposition = 'started';
});

describe('stub Job trigger', () => {
  it('starts each browser demo with a fresh checkpoint identity', async () => {
    await trigger();
    await trigger();

    expect(dispatcher.jobs).toHaveLength(2);
    expect(dispatcher.jobs[0]?.identity.scope).not.toBe(
      dispatcher.jobs[1]?.identity.scope,
    );
  });

  it.each(['started', 'joined'] as const)(
    'accepts the trigger and reports the run %s',
    async (disposition) => {
      dispatcher.disposition = disposition;

      const response = await trigger();

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        correlation_id: dispatcher.correlationIds[0],
        disposition,
      });
    },
  );
});
