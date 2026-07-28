import { describe, expect, it } from 'vitest';
import { archivePathFrom } from './archive-path';

describe('archivePathFrom', () => {
  it.each([
    ['/srv/llm-retro/archive', '/srv/llm-retro/archive'],
    ['  /srv/archive\n', '/srv/archive'],
    ['\t/srv/archive', '/srv/archive'],
  ])('keeps the path the user gave, trimmed', (field, expected) => {
    expect(archivePathFrom(field)).toBe(expected);
  });

  it.each([[''], ['  \t '], ['\n']])(
    'reads a field with nothing but whitespace as no path at all',
    (field) => {
      expect(archivePathFrom(field)).toBeNull();
    },
  );
});
