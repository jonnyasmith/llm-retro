import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type * as healthRoute from '../../routes/api/health/+server';
import type * as bootstrapModule from './bootstrap';
import { openDatabase } from './database/connection';
import { jobRuns } from './database/schema';

describe('application bootstrap', () => {
  describe('a booted application', () => {
    const interruptedCorrelationId = crypto.randomUUID();
    let dataDirectory: string;
    let statusBeforeBoot: string | undefined;
    let bootstrap: typeof bootstrapModule.bootstrap;
    let GET: typeof healthRoute.GET;

    beforeAll(async () => {
      dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-'));
      process.env.LLM_RETRO_DATA_DIR = dataDirectory;

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
      statusBeforeBoot = beforeBoot.database
        .select({ status: jobRuns.status })
        .from(jobRuns)
        .get()?.status;
      beforeBoot.close();

      // Static imports cannot work here: bootstrap opens its Store as a
      // side effect of module evaluation, so it must not load until the
      // data directory above is both seeded and named in the environment.
      ({ bootstrap } = await import('./bootstrap'));
      ({ GET } = await import('../../routes/api/health/+server'));
    });

    afterAll(async () => {
      bootstrap.close();
      await rm(dataDirectory, { recursive: true, force: true });
    });

    it('keeps its Store inside the resolved data directory', () => {
      expect(bootstrap.databasePath).toBe(
        join(dataDirectory, 'llm-retro.sqlite3'),
      );
    });

    it('opens its Store in WAL journal mode', () => {
      expect(
        bootstrap.unsafeSqlite.pragma('journal_mode', { simple: true }),
      ).toBe('wal');
    });

    it('leaves foreign key enforcement on once the migrations have run', () => {
      expect(
        bootstrap.unsafeSqlite.pragma('foreign_keys', { simple: true }),
      ).toBe(1);
    });

    it('records the migrations it applied', () => {
      expect(
        bootstrap.unsafeSqlite
          .prepare(
            "select count(*) from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
          )
          .pluck()
          .get(),
      ).toBe(1);
    });

    it('persists its Store to a file on disk', async () => {
      expect(await readFile(bootstrap.databasePath)).not.toHaveLength(0);
    });

    it('reconciles a Job run an earlier process left running to interrupted', () => {
      expect(statusBeforeBoot).toBe('running');
      expect(bootstrap.database.select().from(jobRuns).get()).toMatchObject({
        correlationId: interruptedCorrelationId,
        status: 'interrupted',
      });
    });

    it('opens a Job run stream over the Store its connection opened', () => {
      expect(
        bootstrap.jobRunStream.open(interruptedCorrelationId),
      ).toBeDefined();
    });

    it('answers the health route with a success status', () => {
      expect(GET().status).toBe(200);
    });

    it('reports the Store connected in its health body', async () => {
      await expect(GET().json()).resolves.toEqual({
        status: 'ok',
        database: 'connected',
      });
    });

    it('hands a second importer the same bootstrap', async () => {
      expect((await import('./bootstrap')).bootstrap).toBe(bootstrap);
    });

    it('hands a second importer the same dispatcher', async () => {
      expect((await import('./bootstrap')).bootstrap.dispatcher).toBe(
        bootstrap.dispatcher,
      );
    });
  });
});
