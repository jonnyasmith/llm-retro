import { describe, expect, it } from 'vitest';
import { mapHarnesses, type Harness } from '$lib/jobs/contracts';
import {
  clearLogSource,
  parseLogSourcePaths,
  pinChangedLogSources,
  type LogSourceInput,
} from './log-sources';

function input(
  overrides: Partial<Record<Harness, string>> = {},
): LogSourceInput {
  return {
    ...mapHarnesses((harness) => `/logs/${harness}`),
    ...overrides,
  };
}

describe('parseLogSourcePaths', () => {
  it('reads one path per line', () => {
    expect(parseLogSourcePaths('/logs/one\n/logs/two')).toEqual([
      '/logs/one',
      '/logs/two',
    ]);
  });

  it('finds no paths in a blank field', () => {
    expect(parseLogSourcePaths('')).toEqual([]);
  });

  it('ignores whitespace-only lines', () => {
    expect(parseLogSourcePaths('/logs/one\n   \n\t\n/logs/two')).toEqual([
      '/logs/one',
      '/logs/two',
    ]);
  });

  it('ignores a trailing newline', () => {
    expect(parseLogSourcePaths('/logs/one\n')).toEqual(['/logs/one']);
  });

  it('finds no paths in whitespace alone', () => {
    expect(parseLogSourcePaths('  \n\t\n ')).toEqual([]);
  });

  it('trims around a path without touching the path itself', () => {
    expect(parseLogSourcePaths('  /logs/my logs  ')).toEqual(['/logs/my logs']);
  });
});

describe('pinChangedLogSources', () => {
  it('leaves the Harnesses the user did not edit out of the payload', () => {
    const baselines = input();
    const values = input({ pi: '/logs/pi\n/logs/pi-extra' });

    const edit = pinChangedLogSources(values, baselines);

    expect(edit.overrides).toEqual({ pi: ['/logs/pi', '/logs/pi-extra'] });
    expect(edit.harnesses).toEqual(['pi']);
  });

  it('pins every Harness the user did edit', () => {
    const baselines = input();
    const values = input({ claude: '/logs/new-claude', omp: '/logs/new-omp' });

    const edit = pinChangedLogSources(values, baselines);

    expect(edit.overrides).toEqual({
      claude: ['/logs/new-claude'],
      omp: ['/logs/new-omp'],
    });
    expect(edit.harnesses).toEqual(['claude', 'omp']);
  });

  it('sends nothing when nothing was edited', () => {
    const edit = pinChangedLogSources(input(), input());

    expect(edit.overrides).toEqual({});
    expect(edit.harnesses).toEqual([]);
  });

  it('counts a reformatted field as an edit', () => {
    const baselines = input({ codex: '/logs/codex' });
    const values = input({ codex: '  /logs/codex  \n\n' });

    const edit = pinChangedLogSources(values, baselines);

    expect(edit.harnesses).toEqual(['codex']);
  });

  it('sends the paths a reformatted field parses to, not its text', () => {
    const baselines = input({ codex: '/logs/codex' });
    const values = input({ codex: '  /logs/codex  \n\n' });

    const edit = pinChangedLogSources(values, baselines);

    expect(edit.overrides).toEqual({ codex: ['/logs/codex'] });
  });

  it('pins an emptied field to no paths rather than clearing the override', () => {
    const edit = pinChangedLogSources(input({ pi: '' }), input());

    expect(edit.overrides).toEqual({ pi: [] });
  });
});

describe('clearLogSource', () => {
  it('returns the Harness to built-in defaults', () => {
    expect(clearLogSource('pi').overrides).toEqual({ pi: null });
  });

  it('is not the same as pinning the Harness to no paths', () => {
    expect(clearLogSource('pi').overrides).not.toEqual({ pi: [] });
  });

  it('names only the Harness being cleared', () => {
    expect(clearLogSource('pi').harnesses).toEqual(['pi']);
  });
});
