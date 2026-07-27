import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './database/connection';
import { jobRuns } from './database/schema';

describe('application bootstrap', () => {
  it('boots an isolated migrated WAL database and serves its health', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-'));
    process.env.LLM_RETRO_DATA_DIR = dataDirectory;
    const interruptedCorrelationId = crypto.randomUUID();
    const beforeBoot = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
    beforeBoot.database
      .insert(jobRuns)
      .values({
        type: 'stub',
        scope: '',
        correlationId: interruptedCorrelationId,
        status: 'running',
        startedAt: 1,
      })
      .run();
    beforeBoot.close();

    const { bootstrap } = await import('./bootstrap');
    const { GET } = await import('../../routes/api/health/+server');

    try {
      expect(bootstrap.databasePath).toBe(
        join(dataDirectory, 'llm-retro.sqlite3'),
      );
      expect(
        bootstrap.unsafeSqlite.pragma('journal_mode', { simple: true }),
      ).toBe('wal');
      expect(
        bootstrap.unsafeSqlite
          .prepare(
            "select count(*) from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
          )
          .pluck()
          .get(),
      ).toBe(1);
      expect(await readFile(bootstrap.databasePath)).not.toHaveLength(0);
      expect(bootstrap.database.select().from(jobRuns).get()).toMatchObject({
        correlationId: interruptedCorrelationId,
        status: 'interrupted',
      });

      const response = GET();
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: 'ok',
        database: 'connected',
      });
      expect((await import('./bootstrap')).bootstrap).toBe(bootstrap);
      expect((await import('./bootstrap')).bootstrap.dispatcher).toBe(
        bootstrap.dispatcher,
      );
    } finally {
      bootstrap.close();
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });
});
