import { invalidateAll } from '$app/navigation';
import type { SettingsChanges } from './contracts';

export async function saveSettings(changes: SettingsChanges): Promise<void> {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(changes),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof result === 'object' &&
      result !== null &&
      'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : 'Unable to save settings';
    throw new Error(message);
  }
  await invalidateAll();
}
