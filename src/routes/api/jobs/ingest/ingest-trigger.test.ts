import { harnesses } from '$lib/jobs/contracts';
import { isHttpError } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

const CORRELATION_ID = '55555555-5555-4555-8555-555555555555';

const dispatch = vi.hoisted(() =>
  vi.fn(() => '55555555-5555-4555-8555-555555555555'),
);

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: { dispatcher: { dispatch } },
}));

import { POST } from './[harness]/+server';

// The handler reads nothing but the path parameter, so the surrounding
// SvelteKit request event is supplied only to satisfy the signature.
const trigger = (harness: string) =>
  POST({ params: { harness } } as Parameters<typeof POST>[0]);

afterEach(() => dispatch.mockClear());

describe('Ingest trigger route', () => {
  it.each(harnesses)(
    'dispatches the %s ingest Job and echoes its correlation id',
    async (harness) => {
      const response = await trigger(harness);

      expect(dispatch).toHaveBeenCalledWith({
        identity: { type: 'ingest', scope: harness },
        payload: null,
      });
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        correlation_id: CORRELATION_ID,
      });
    },
  );

  it('rejects an unrecognised Harness with a 404', () => {
    let thrown: unknown;
    try {
      trigger('gemini');
    } catch (cause) {
      thrown = cause;
    }

    expect(isHttpError(thrown, 404)).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
