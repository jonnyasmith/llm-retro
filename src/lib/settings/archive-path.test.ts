import { describe, expect, it } from 'vitest';
import { archivePathFrom } from './archive-path';

describe('archivePathFrom', () => {
  it('keeps the path the user typed', () => {
    expect(archivePathFrom('/srv/llm-retro/archive')).toBe(
      '/srv/llm-retro/archive',
    );
  });

  it('reads an empty field as no path at all', () => {
    expect(archivePathFrom('')).toBeNull();
  });

  it('reads a whitespace-only field as no path at all', () => {
    expect(archivePathFrom('  \t ')).toBeNull();
  });

  it('trims around a path the user pasted', () => {
    expect(archivePathFrom('  /srv/archive\n')).toBe('/srv/archive');
  });
});
