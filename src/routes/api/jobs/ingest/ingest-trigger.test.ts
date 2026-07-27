import { harnesses } from '$lib/jobs/contracts';
import type { JobDispatch } from '$lib/server/jobs/dispatcher';
import { isHttpError } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

const CORRELATION_ID = '55555555-5555-4555-8555-555555555555';

const dispatch = vi.hoisted(() => vi.fn<() => JobDispatch>());

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: { dispatcher: { dispatch } },
}));

import { POST } from './[harness]/+server';

// The handler reads nothing but the path parameter, so the surrounding
// SvelteKit request event is supplied only to satisfy the signature.
const trigger = (harness: string) =>
  POST({ params: { harness } } as Parameters<typeof POST>[0]);

afterEach(() => dispatch.mockReset());

describe('Ingest trigger route', () => {
  it.each(harnesses)(
    'dispatches the %s ingest Job and reports that it started',
    async (harness) => {
      dispatch.mockReturnValue({
        correlationId: CORRELATION_ID,
        disposition: 'started',
      });

      const response = await trigger(harness);

      expect(dispatch).toHaveBeenCalledWith({
        identity: { type: 'ingest', scope: harness },
        payload: null,
      });
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        correlation_id: CORRELATION_ID,
        disposition: 'started',
      });
    },
  );

  it('accepts a joined run and names the run already in flight', async () => {
    dispatch.mockReturnValue({
      correlationId: CORRELATION_ID,
      disposition: 'joined',
    });

    const response = await trigger('claude');

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      correlation_id: CORRELATION_ID,
      disposition: 'joined',
    });
  });

  it('rejects an unrecognised Harness with a 404', async () => {
    let thrown: unknown;
    try {
      // Awaited, not called bare: the handler's declared return type permits a
      // Promise, so a rejection would otherwise escape this catch entirely.
      await trigger('gemini');
    } catch (cause) {
      thrown = cause;
    }

    expect(isHttpError(thrown, 404)).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
