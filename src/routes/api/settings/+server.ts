import { bootstrap } from '$lib/server/bootstrap';
import { saveSettings } from '$lib/server/settings/service';
import {
  IngestionActiveError,
  InvalidSettingsError,
} from '$lib/server/settings/errors';
import { ingestHarnesses } from '$lib/jobs/contracts';
import type { SettingsChanges } from '$lib/settings/contracts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const settingsKeys = new Set([
  'timezone',
  'rawArchiveEnabled',
  'rawArchivePath',
  'logSourceOverrides',
]);
const harnessKeys = new Set<string>(ingestHarnesses);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === 'string')
  );
}

function parseLogSourceOverrides(
  value: unknown,
): SettingsChanges['logSourceOverrides'] {
  if (!isRecord(value)) {
    throw new InvalidSettingsError('Log source overrides must be an object');
  }
  if (Object.keys(value).some((key) => !harnessKeys.has(key))) {
    throw new InvalidSettingsError(
      'Log source override has an unknown Harness',
    );
  }

  const overrides: NonNullable<SettingsChanges['logSourceOverrides']> = {};
  for (const harness of ingestHarnesses) {
    if (!(harness in value)) continue;
    const paths = value[harness];
    if (paths !== null && !isStringArray(paths)) {
      throw new InvalidSettingsError(
        'Log source overrides must contain path lists or null',
      );
    }
    overrides[harness] = paths;
  }
  return overrides;
}

function parseSettingsChanges(input: unknown): SettingsChanges {
  if (!isRecord(input)) {
    throw new InvalidSettingsError('Expected a JSON object');
  }
  if (Object.keys(input).some((key) => !settingsKeys.has(key))) {
    throw new InvalidSettingsError('Settings change has an unknown key');
  }

  const changes: SettingsChanges = {};
  if ('timezone' in input) {
    if (typeof input.timezone !== 'string') {
      throw new InvalidSettingsError('Timezone must be a string');
    }
    changes.timezone = input.timezone;
  }
  if ('rawArchiveEnabled' in input) {
    if (typeof input.rawArchiveEnabled !== 'boolean') {
      throw new InvalidSettingsError('Raw archive enabled must be a boolean');
    }
    changes.rawArchiveEnabled = input.rawArchiveEnabled;
  }
  if ('rawArchivePath' in input) {
    if (
      input.rawArchivePath !== null &&
      typeof input.rawArchivePath !== 'string'
    ) {
      throw new InvalidSettingsError(
        'Raw archive path must be a string or null',
      );
    }
    changes.rawArchivePath = input.rawArchivePath;
  }
  if ('logSourceOverrides' in input) {
    changes.logSourceOverrides = parseLogSourceOverrides(
      input.logSourceOverrides,
    );
  }
  return changes;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const input: unknown = await request.json();
    return json(
      await saveSettings(bootstrap.database, parseSettingsChanges(input)),
    );
  } catch (cause) {
    if (cause instanceof IngestionActiveError) {
      return json({ error: cause.message }, { status: 409 });
    }
    if (cause instanceof InvalidSettingsError || cause instanceof SyntaxError) {
      return json(
        {
          error:
            cause instanceof Error ? cause.message : 'Invalid settings change',
        },
        { status: 400 },
      );
    }
    throw cause;
  }
};
