import { invalidateAll } from '$app/navigation';
import type { SettingsChanges } from './contracts';

/**
 * Posts a Settings change and refreshes the screen once the server has taken
 * it.
 *
 * Throws on failure carrying one of two messages: the server's own words, or
 * nothing at all. The server counts as having spoken only when it answers a
 * failure with a JSON object holding a string `error`; a body that will not
 * decode, a request nothing answered, and any other shape are all
 * indescribable, and throw blank so the calling form supplies its own wording.
 * A fault in the request itself is nobody's to describe and is rethrown.
 */
export async function saveSettings(changes: SettingsChanges): Promise<void> {
  const body = JSON.stringify(changes);
  let response: Response;
  try {
    response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch (cause) {
    // `fetch` rejects with a TypeError when nothing answered it. Anything else
    // is a fault of this call rather than of the network.
    if (!(cause instanceof TypeError)) throw cause;
    throw new Error('', { cause });
  }
  if (!response.ok) throw new Error(await serverMessage(response));
  await invalidateAll();
}

/** The words the server put on a failure, or '' if it said nothing legible. */
async function serverMessage(failure: Response): Promise<string> {
  let body: unknown;
  try {
    body = await failure.json();
  } catch {
    return '';
  }
  return typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'string'
    ? body.error
    : '';
}
