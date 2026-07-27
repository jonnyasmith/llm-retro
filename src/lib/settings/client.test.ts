import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSettings } from './client';
import type { SettingsChanges } from './contracts';

/** SvelteKit's reload of the screen's data, which a saved Setting triggers. */
const invalidateAll = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('$app/navigation', () => ({ invalidateAll }));

const changes: SettingsChanges = { timezone: 'Europe/London' };

const post = vi.fn<typeof fetch>();

beforeEach(() => {
  post.mockReset();
  invalidateAll.mockReset();
  invalidateAll.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', post);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The message a save reports when it fails. '' is the client saying it has
 * nothing legible, which the form answers with its own wording.
 */
async function reportedMessage(): Promise<string> {
  try {
    await saveSettings(changes);
  } catch (cause) {
    return cause instanceof Error
      ? cause.message
      : `not an Error: ${String(cause)}`;
  }
  throw new Error('The save resolved rather than reporting a failure');
}

/** The message a save reports when the server rejects it with this body. */
async function messageFor(body: unknown): Promise<string> {
  post.mockResolvedValue(Response.json(body, { status: 400 }));
  return reportedMessage();
}

describe('saveSettings', () => {
  it('posts the changes to the Settings endpoint as JSON', async () => {
    post.mockResolvedValue(Response.json({}));

    await saveSettings(changes);

    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0];
    expect(url).toEqual('/api/settings');
    expect(init?.method).toEqual('POST');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(init?.body).toEqual('{"timezone":"Europe/London"}');
  });

  it('refreshes the screen once the server has accepted the save', async () => {
    post.mockResolvedValue(Response.json({}));

    await saveSettings(changes);

    expect(invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('does not finish until the refreshed screen has caught up', async () => {
    // The caller shows its confirmation on the strength of this promise, so
    // resolving early would confirm a save over values still being replaced.
    post.mockResolvedValue(Response.json({}));
    let refreshed = () => {};
    invalidateAll.mockReturnValue(
      new Promise<void>((resolve) => {
        refreshed = resolve;
      }),
    );
    let finished = false;

    const saving = saveSettings(changes).then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(invalidateAll).toHaveBeenCalled());
    expect(finished).toBe(false);

    refreshed();
    await saving;

    expect(finished).toBe(true);
  });

  it("reports the server's own message when the save is rejected", async () => {
    await expect(
      messageFor({ error: 'Ingestion is running' }),
    ).resolves.toEqual('Ingestion is running');
  });

  it('says nothing when the failure body is not an object', async () => {
    await expect(messageFor(null)).resolves.toEqual('');
    await expect(messageFor(42)).resolves.toEqual('');
    await expect(messageFor('Ingestion is running')).resolves.toEqual('');
    await expect(messageFor([])).resolves.toEqual('');
  });

  it('says nothing when the failure body has no string error', async () => {
    await expect(messageFor({})).resolves.toEqual('');
    await expect(messageFor({ error: 42 })).resolves.toEqual('');
    await expect(messageFor({ error: null })).resolves.toEqual('');
    await expect(messageFor({ error: { message: 'No' } })).resolves.toEqual('');
  });

  it("says nothing when the failure is SvelteKit's own error response", async () => {
    // An unhandled throw in the endpoint answers `{ message }`, not `{ error }`
    // — a framework string rather than words chosen for this user, so the form
    // names itself instead.
    await expect(messageFor({ message: 'Internal Error' })).resolves.toEqual(
      '',
    );
  });

  it('treats an explicitly empty server message as no message', async () => {
    // An empty string is still a string, so the narrowing accepts it and it
    // joins every other failure the client cannot describe.
    await expect(messageFor({ error: '' })).resolves.toEqual('');
  });

  it('says nothing when the failure body is not JSON', async () => {
    // A reverse proxy's error page in front of the Node server. The status is
    // read before the body, so the decode failure is part of the narrowing
    // rather than a step in front of it.
    post.mockResolvedValue(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    );

    await expect(reportedMessage()).resolves.toEqual('');
  });

  it('says nothing when nothing answered the request', async () => {
    // A dead server rejects the fetch rather than answering it. Its own wording
    // names the transport, which is not something to show the user.
    post.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(reportedMessage()).resolves.toEqual('');
    expect(invalidateAll).not.toHaveBeenCalled();
  });

  it('refreshes the screen even when an accepted save answers with no JSON', async () => {
    // Nothing reads the body of a successful save, so nothing about it can
    // fail the save.
    post.mockResolvedValue(new Response('<html>Saved</html>', { status: 200 }));

    await saveSettings(changes);

    expect(invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('leaves the screen alone when the save is rejected', async () => {
    await expect(messageFor({ error: 'Invalid timezone' })).resolves.toEqual(
      'Invalid timezone',
    );

    expect(invalidateAll).not.toHaveBeenCalled();
  });
});
