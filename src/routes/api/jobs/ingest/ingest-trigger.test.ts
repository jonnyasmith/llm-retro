import { afterEach, describe, expect, it, vi } from 'vitest';

const CORRELATION_ID = '55555555-5555-4555-8555-555555555555';

const dispatch = vi.hoisted(() =>
  vi.fn(() => '55555555-5555-4555-8555-555555555555'),
);

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: { dispatcher: { dispatch } },
}));

import { POST as claude } from './claude/+server';
import { POST as codex } from './codex/+server';
import { POST as omp } from './omp/+server';
import { POST as pi } from './pi/+server';

// The four routes are identical pass-throughs; adapt SvelteKit's route-specific
// RequestHandler to a uniform callable so one parametrised test covers them all.
type IngestTrigger = (event: {
  request: Request;
}) => Promise<Response> | Response;

const routes: Array<[string, IngestTrigger]> = [
  ['claude', claude as unknown as IngestTrigger],
  ['codex', codex as unknown as IngestTrigger],
  ['pi', pi as unknown as IngestTrigger],
  ['omp', omp as unknown as IngestTrigger],
];

afterEach(() => dispatch.mockClear());

describe('Ingest trigger routes', () => {
  it.each(routes)(
    'returns 202 echoing the dispatched correlation id for %s',
    async (scope, POST) => {
      const request = new Request(`http://localhost/api/jobs/ingest/${scope}`, {
        method: 'POST',
      });

      const response = await POST({ request });

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        correlation_id: CORRELATION_ID,
      });
    },
  );
});
