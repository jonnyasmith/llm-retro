import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataDirectory } from './connection';

describe('data directory resolution', () => {
  it('stores app state where each platform keeps it', () => {
    expect(resolveDataDirectory({}, 'darwin')).toBe(
      join(homedir(), 'Library', 'Application Support', 'llm-retro'),
    );
    expect(resolveDataDirectory({ APPDATA: '/roaming' }, 'win32')).toBe(
      join('/roaming', 'llm-retro'),
    );
    expect(resolveDataDirectory({ XDG_DATA_HOME: '/share' }, 'linux')).toBe(
      join('/share', 'llm-retro'),
    );
  });

  it('falls back to the conventional root when a platform variable is unset', () => {
    expect(resolveDataDirectory({}, 'win32')).toBe(
      join(homedir(), 'AppData', 'Roaming', 'llm-retro'),
    );
    expect(resolveDataDirectory({}, 'linux')).toBe(
      join(homedir(), '.local', 'share', 'llm-retro'),
    );
  });

  it('lets the override beat every platform rule, made absolute', () => {
    expect(
      resolveDataDirectory({ LLM_RETRO_DATA_DIR: '/pinned' }, 'darwin'),
    ).toBe('/pinned');
    expect(
      resolveDataDirectory(
        { LLM_RETRO_DATA_DIR: 'pinned', APPDATA: '/roaming' },
        'win32',
      ),
    ).toBe(join(process.cwd(), 'pinned'));
  });
});
