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

/**
 * The message a trigger reports when it fails. '' is the client saying it has
 * nothing legible, which the Harness's section answers with its own wording.
 */
async function reportedMessage(): Promise<string> {
  try {
    await triggerIngest('claude');
  } catch (cause) {
    return cause instanceof Error
      ? cause.message
      : `not an Error: ${String(cause)}`;
  }
  throw new Error('The trigger resolved rather than reporting a failure');
}

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

  it('says nothing when the endpoint refuses', async () => {
    // The trigger endpoint answers a refusal in SvelteKit's own words rather
    // than in any shape agreed with this client, so there is nothing to repeat.
    post.mockResolvedValue(
      Response.json({ message: 'Unknown Harness' }, { status: 404 }),
    );

    await expect(reportedMessage()).resolves.toEqual('');
  });

  it('says nothing when the failure body reads like a message for the user', async () => {
    // The shape the Settings endpoint answers with. This endpoint has no such
    // shape, so an `{ error }` body is something in front of the Node server
    // talking, not the server, and the section names itself rather than
    // repeating it.
    post.mockResolvedValue(
      Response.json({ error: 'Ingestion is already running' }, { status: 409 }),
    );

    await expect(reportedMessage()).resolves.toEqual('');
  });

  it('says nothing when the failure body is not JSON', async () => {
    // A reverse proxy's error page in front of the Node server.
    post.mockResolvedValue(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    );

    await expect(reportedMessage()).resolves.toEqual('');
  });

  it('says nothing when an accepted trigger answers with no JSON', async () => {
    // The correlation id is the whole point of the call, so an undecodable
    // success is as unusable as a refusal.
    post.mockResolvedValue(new Response('<html>Hello</html>', { status: 202 }));

    await expect(reportedMessage()).resolves.toEqual('');
  });

  it('says nothing when an accepted trigger names no Job run', async () => {
    post.mockResolvedValue(
      Response.json({ correlation_id: 'run-1' }, { status: 202 }),
    );

    await expect(reportedMessage()).resolves.toEqual('');
  });

  it('says nothing when nothing answered the request', async () => {
    // A dead server rejects the fetch rather than answering it. Its own wording
    // names the transport, which is not something to show the user.
    post.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(reportedMessage()).resolves.toEqual('');
  });

  it('rethrows a fault in the request rather than describing it', async () => {
    // Only a transport failure is the server's silence. Anything else went
    // wrong in here, and hiding it behind the section's wording would bury it.
    const fault = new RangeError('Maximum call stack size exceeded');
    post.mockRejectedValue(fault);

    await expect(triggerIngest('claude')).rejects.toBe(fault);
  });
});
