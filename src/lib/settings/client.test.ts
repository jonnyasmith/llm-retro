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

/** The message a save surfaces when the server rejects it with this body. */
async function messageFor(body: unknown): Promise<string> {
  post.mockResolvedValue(Response.json(body, { status: 400 }));
  try {
    await saveSettings(changes);
  } catch (cause) {
    return cause instanceof Error ? cause.message : `not an Error: ${cause}`;
  }
  throw new Error('The save resolved rather than reporting a failure');
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

  it('falls back when the failure body is not an object', async () => {
    await expect(messageFor(null)).resolves.toEqual('Unable to save settings');
    await expect(messageFor(42)).resolves.toEqual('Unable to save settings');
    await expect(messageFor('Ingestion is running')).resolves.toEqual(
      'Unable to save settings',
    );
    await expect(messageFor([])).resolves.toEqual('Unable to save settings');
  });

  it('falls back when the failure body has no string error', async () => {
    await expect(messageFor({})).resolves.toEqual('Unable to save settings');
    await expect(messageFor({ error: 42 })).resolves.toEqual(
      'Unable to save settings',
    );
    await expect(messageFor({ error: null })).resolves.toEqual(
      'Unable to save settings',
    );
    await expect(messageFor({ error: { message: 'No' } })).resolves.toEqual(
      'Unable to save settings',
    );
    await expect(
      messageFor({ message: 'Ingestion is running' }),
    ).resolves.toEqual('Unable to save settings');
  });

  it('passes an empty error message on rather than filling it in', async () => {
    // An empty string is still a string, so the narrowing accepts it. The save
    // lifecycle beside this module substitutes the form's own wording for a
    // blank message, which is why nothing here has to.
    await expect(messageFor({ error: '' })).resolves.toEqual('');
  });

  it('reports the decode failure when the failure body is not JSON', async () => {
    // The one unrecognisable response the narrowing never sees. The body is
    // decoded before the status is read, so a failure page that is not JSON
    // throws from the decode instead of reaching the fallback message.
    post.mockResolvedValue(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    );

    await expect(saveSettings(changes)).rejects.toThrow(SyntaxError);
  });

  it('leaves the screen alone when the save is rejected', async () => {
    await expect(messageFor({ error: 'Invalid timezone' })).resolves.toEqual(
      'Invalid timezone',
    );

    expect(invalidateAll).not.toHaveBeenCalled();
  });
});
