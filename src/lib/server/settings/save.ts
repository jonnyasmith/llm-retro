import { mkdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { harnesses, isHarness } from '../../jobs/contracts';
import type {
  ApplicationSettings,
  SettingsChanges,
} from '../../settings/contracts';
import type { Database } from '../database/connection';
import { getSettings, persistSettings } from '../database/store';
import { createLocalBucketDeriver } from '../database/time-buckets';
import { InvalidSettingsError } from './errors';

/**
 * Saves an untrusted Settings change: parses it, applies every rule Settings
 * are subject to, creates the Raw archive directory when a save enables one,
 * and commits. Returns the full resolved Settings the Store now holds.
 *
 * `input` is untrusted and may be a promise, so that a malformed request body
 * fails here rather than at the caller: a caller then has exactly two failures
 * to tell apart, `InvalidSettingsError` and the `IngestionActiveError` that
 * ADR-0011's concurrency rule raises from the write itself.
 *
 * The archive directory is created before the transaction, because the
 * transaction is synchronous and cannot await. A refused save may therefore
 * leave an empty directory behind — harmless and idempotent, unlike committing
 * an archive path that failed to create (ADR-0011).
 */
export async function saveSettings(
  database: Database,
  input: unknown,
): Promise<ApplicationSettings> {
  const changes = parseChanges(await readBody(input));
  const current = getSettings(database);

  if (changes.timezone !== undefined) {
    requireKnownTimezone(changes.timezone);
  }
  requireAbsoluteLogSources(changes.logSourceOverrides);
  await prepareRawArchive(changes, current);

  return persistSettings(database, changes);
}

async function readBody(input: unknown): Promise<unknown> {
  try {
    return await input;
  } catch (cause) {
    throw new InvalidSettingsError(
      messageFrom(cause, 'Settings change is not valid JSON'),
    );
  }
}

type FieldParser = (value: unknown, changes: SettingsChanges) => void;

/**
 * One entry per Settings field. A new field costs an entry here, plus a rule
 * below if it needs one.
 */
const fieldParsers: Record<string, FieldParser> = {
  timezone(value, changes) {
    if (typeof value !== 'string') {
      throw new InvalidSettingsError('Timezone must be a string');
    }
    changes.timezone = value;
  },
  rawArchiveEnabled(value, changes) {
    if (typeof value !== 'boolean') {
      throw new InvalidSettingsError('Raw archive enabled must be a boolean');
    }
    changes.rawArchiveEnabled = value;
  },
  rawArchivePath(value, changes) {
    if (value !== null && typeof value !== 'string') {
      throw new InvalidSettingsError(
        'Raw archive path must be a string or null',
      );
    }
    changes.rawArchivePath = value;
  },
  logSourceOverrides(value, changes) {
    changes.logSourceOverrides = parseLogSourceOverrides(value);
  },
};

function parseChanges(body: unknown): SettingsChanges {
  if (!isRecord(body)) {
    throw new InvalidSettingsError('Expected a JSON object');
  }

  const changes: SettingsChanges = {};
  for (const [key, value] of Object.entries(body)) {
    if (!Object.hasOwn(fieldParsers, key)) {
      throw new InvalidSettingsError('Settings change has an unknown key');
    }
    fieldParsers[key](value, changes);
  }
  return changes;
}

function parseLogSourceOverrides(
  value: unknown,
): SettingsChanges['logSourceOverrides'] {
  if (!isRecord(value)) {
    throw new InvalidSettingsError('Log source overrides must be an object');
  }

  const overrides: NonNullable<SettingsChanges['logSourceOverrides']> = {};
  for (const [harness, paths] of Object.entries(value)) {
    if (!isHarness(harness)) {
      throw new InvalidSettingsError(
        'Log source override has an unknown Harness',
      );
    }
    if (paths !== null && !isStringArray(paths)) {
      throw new InvalidSettingsError(
        'Log source overrides must contain path lists or null',
      );
    }
    overrides[harness] = paths;
  }
  return overrides;
}

/** A timezone is valid exactly when a bucket deriver can be built for it. */
function requireKnownTimezone(timezone: string): void {
  try {
    createLocalBucketDeriver(timezone);
  } catch (cause) {
    throw new InvalidSettingsError(messageFrom(cause, 'Timezone is invalid'));
  }
}

function requireAbsoluteLogSources(
  overrides: SettingsChanges['logSourceOverrides'],
): void {
  for (const harness of harnesses) {
    const paths = overrides?.[harness];
    if (paths === undefined || paths === null) continue;
    if (paths.length === 0) {
      throw new InvalidSettingsError(
        'Each Log source override requires at least one path',
      );
    }
    for (const path of paths) requireAbsolutePath(path);
  }
}

/**
 * Applied only when a save touches the archive, so that a row already holding a
 * relative path cannot block a save of an unrelated section.
 */
async function prepareRawArchive(
  changes: SettingsChanges,
  current: ApplicationSettings,
): Promise<void> {
  if (
    changes.rawArchiveEnabled === undefined &&
    changes.rawArchivePath === undefined
  ) {
    return;
  }

  const enabled = changes.rawArchiveEnabled ?? current.rawArchiveEnabled;
  const path =
    changes.rawArchivePath === undefined
      ? current.rawArchivePath
      : changes.rawArchivePath;
  if (path !== null) requireAbsolutePath(path);
  if (!enabled) return;
  if (path === null) {
    throw new InvalidSettingsError(
      'Raw archive path is required while the archive is enabled',
    );
  }

  try {
    await mkdir(path, { recursive: true });
  } catch (cause) {
    throw new InvalidSettingsError(
      messageFrom(cause, 'Unable to create the Raw archive directory'),
    );
  }
}

/**
 * The absolute-path rule, for every path Settings hold. A whitespace-only path
 * is no path at all, and fails here with the rest.
 */
function requireAbsolutePath(path: string): void {
  if (!isAbsolute(path)) {
    throw new InvalidSettingsError(`Path must be absolute: "${path}"`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === 'string')
  );
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
