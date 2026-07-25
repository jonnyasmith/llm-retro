import type { Harness } from '$lib/jobs/contracts';

export type LogSources = Record<Harness, string[]>;

export interface ApplicationSettings {
  timezone: string;
  rawArchiveEnabled: boolean;
  rawArchivePath: string | null;
  logSources: LogSources;
  logSourceOverrides: Partial<LogSources>;
}

export interface SettingsChanges {
  timezone?: string;
  rawArchiveEnabled?: boolean;
  rawArchivePath?: string | null;
  logSourceOverrides?: Partial<Record<Harness, string[] | null>>;
}
