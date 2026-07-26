import { harnesses, type Harness } from '$lib/jobs/contracts';
import type { SettingsChanges } from './contracts';

/** The Log sources form's text, one textarea's worth per Harness. */
export type LogSourceInput = Record<Harness, string>;

export interface LogSourceEdit {
  /**
   * The Harnesses this edit touches, and the only ones whose rows may be
   * refreshed from the server afterwards — the rest may hold unsaved typing.
   */
  readonly harnesses: readonly Harness[];
  readonly overrides: NonNullable<SettingsChanges['logSourceOverrides']>;
}

/**
 * One absolute path per line. Blank lines and stray whitespace are the user
 * formatting their input, not paths they meant to pin.
 */
export function parseLogSourcePaths(value: string): string[] {
  return value
    .split('\n')
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

/**
 * Pins the Harnesses whose paths the user actually edited, and only those. An
 * override the user pinned elsewhere — another tab, another session — is not
 * in the payload, so saving one row cannot overwrite it.
 */
export function pinChangedLogSources(
  values: LogSourceInput,
  baselines: LogSourceInput,
): LogSourceEdit {
  const changed = harnesses.filter(
    (harness) => values[harness] !== baselines[harness],
  );
  return {
    harnesses: changed,
    overrides: Object.fromEntries(
      changed.map((harness) => [harness, parseLogSourcePaths(values[harness])]),
    ),
  };
}

/**
 * Returns a Harness to its built-in defaults. Distinct from pinning it to an
 * empty path list: defaults are followed as they change, an empty list is a
 * pin to nothing and the Settings write path refuses it.
 */
export function clearLogSource(harness: Harness): LogSourceEdit {
  return { harnesses: [harness], overrides: { [harness]: null } };
}
