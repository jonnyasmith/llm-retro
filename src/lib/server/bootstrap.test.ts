import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('application bootstrap', () => {
  it('boots an isolated migrated WAL database and serves its health', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-'));
    process.env.LLM_RETRO_DATA_DIR = dataDirectory;

    const { bootstrap } = await import('./bootstrap');
    const { GET } = await import('../../routes/api/health/+server');

    try {
      expect(bootstrap.databasePath).toBe(
        join(dataDirectory, 'llm-retro.sqlite3'),
      );
      expect(bootstrap.sqlite.pragma('journal_mode', { simple: true })).toBe(
        'wal',
      );
      expect(
        bootstrap.sqlite
          .prepare(
            "select count(*) from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
          )
          .pluck()
          .get(),
      ).toBe(1);
      expect(await readFile(bootstrap.databasePath)).not.toHaveLength(0);

      const response = await GET();
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: 'ok',
        database: 'connected',
      });
      expect((await import('./bootstrap')).bootstrap).toBe(bootstrap);
    } finally {
      bootstrap.sqlite.close();
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });
});
