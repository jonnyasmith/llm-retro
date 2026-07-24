import type { Database } from '../database/connection';
import {
  getSettings,
  hasActiveIngestRun,
  persistSettings,
} from '../database/store';
import { IngestionActiveError, InvalidSettingsError } from './errors';
import { deriveLocalBuckets } from '../database/time-buckets';
import type { SettingsChanges } from '../../settings/contracts';
import { mkdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

function validateTimezone(timezone: string): void {
  try {
    deriveLocalBuckets(0, timezone);
  } catch (cause) {
    throw new InvalidSettingsError(
      cause instanceof Error ? cause.message : 'Timezone is invalid',
    );
  }
}

function validateLogSources(changes: SettingsChanges): void {
  for (const paths of Object.values(changes.logSourceOverrides ?? {})) {
    if (paths === null) continue;
    if (paths.length === 0) {
      throw new InvalidSettingsError(
        'Each Log source override requires at least one path',
      );
    }
    if (paths.some((path) => path.trim().length === 0 || !isAbsolute(path))) {
      throw new InvalidSettingsError('Log source paths must be absolute');
    }
  }
}

export async function saveSettings(
  database: Database,
  changes: SettingsChanges,
): Promise<ReturnType<typeof getSettings>> {
  if (changes.timezone !== undefined) {
    validateTimezone(changes.timezone);
  }
  validateLogSources(changes);

  const current = getSettings(database);
  const changesTimezone =
    changes.timezone !== undefined && changes.timezone !== current.timezone;
  if (changesTimezone && hasActiveIngestRun(database)) {
    throw new IngestionActiveError(
      'An Ingestion run is running; retry when it has finished',
    );
  }

  const changesArchive =
    changes.rawArchiveEnabled !== undefined ||
    changes.rawArchivePath !== undefined;
  if (changesArchive) {
    const enabled = changes.rawArchiveEnabled ?? current.rawArchiveEnabled;
    const path =
      changes.rawArchivePath === undefined
        ? current.rawArchivePath
        : changes.rawArchivePath;
    if (path !== null && (path.trim().length === 0 || !isAbsolute(path))) {
      throw new InvalidSettingsError(
        'Raw archive path must be an absolute path',
      );
    }
    if (enabled && path === null) {
      throw new InvalidSettingsError(
        'Raw archive path is required while the archive is enabled',
      );
    }
    if (enabled && path !== null) {
      try {
        await mkdir(path, { recursive: true });
      } catch (cause) {
        throw new InvalidSettingsError(
          cause instanceof Error
            ? cause.message
            : 'Unable to create the Raw archive directory',
        );
      }
    }
  }

  return persistSettings(database, changes, {
    rejectTimezoneChangeDuringIngestion: true,
  });
}
