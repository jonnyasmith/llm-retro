import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerIngest } from './client';

const post = vi.fn<typeof fetch>();

beforeEach(() => {
  post.mockReset();
  vi.stubGlobal('fetch', post);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('triggerIngest', () => {
  it('posts to the endpoint for the Harness it was asked about', async () => {
    post.mockResolvedValue(
      Response.json({ correlation_id: 'run-1', disposition: 'started' }),
    );

    await triggerIngest('codex');

    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0];
    expect(url).toEqual('/api/jobs/ingest/codex');
    expect(init?.method).toEqual('POST');
  });

  it("hands back the server's correlation id and disposition", async () => {
    post.mockResolvedValue(
      Response.json({ correlation_id: 'run-1', disposition: 'joined' }),
    );

    await expect(triggerIngest('claude')).resolves.toEqual({
      correlation_id: 'run-1',
      disposition: 'joined',
    });
  });

  it('surfaces the response body when the endpoint refuses', async () => {
    // A refusal here carries no agreed shape, so there is nothing to decode
    // and the body travels to the screen as it arrived.
    post.mockResolvedValue(new Response('Unknown Harness', { status: 404 }));

    await expect(triggerIngest('claude')).rejects.toThrow('Unknown Harness');
  });
});
