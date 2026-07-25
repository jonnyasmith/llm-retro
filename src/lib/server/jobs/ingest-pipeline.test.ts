import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkpoints,
  interactions,
  projects,
  sessions,
} from '../database/schema';
import { persistSettings } from '../database/store';
import type { CwdProjectResolver } from './project-resolver';
import {
  FAKE_HARNESS,
  cleanupPipelineFixtures,
  createFakeAdapter,
  createPipelineFixture,
  runPipeline,
  writeLines,
} from './ingest-pipeline-fixture';

afterEach(cleanupPipelineFixtures);

const BASE = Date.parse('2025-01-01T10:00:00.000Z');

describe('Ingest pipeline', () => {
  it('stores every Session, Interaction and Project and reports per-file progress', async () => {
    const fixture = await createPipelineFixture();
    await writeLines(join(fixture.logSource, 'a.log'), [
      { key: 'a-1', cwd: '/repo/one', timestamp: BASE, main: { output: 3 } },
      { key: 'a-2', cwd: '/repo/one', timestamp: BASE + 1_000 },
    ]);
    await writeLines(join(fixture.logSource, 'b.log'), [
      { key: 'b-1', cwd: '/repo/two', timestamp: BASE + 2_000 },
    ]);
    const progress = vi.fn();

    try {
      await runPipeline(createFakeAdapter(), fixture.database, { progress });

      expect(fixture.database.select().from(sessions).all()).toHaveLength(2);
      expect(
        fixture.database
          .select({ key: interactions.interactionKey })
          .from(interactions)
          .orderBy(interactions.interactionKey)
          .all(),
      ).toEqual([{ key: 'a-1' }, { key: 'a-2' }, { key: 'b-1' }]);
      expect(
        fixture.database
          .select({ rootPath: projects.rootPath })
          .from(projects)
          .orderBy(projects.rootPath)
          .all(),
      ).toEqual([{ rootPath: '/repo/one' }, { rootPath: '/repo/two' }]);

      expect(progress).toHaveBeenCalledWith({ filesTotal: 2, filesDone: 0 });
      expect(progress).toHaveBeenCalledWith({
        filesTotal: 2,
        filesDone: 0,
        currentFile: join(fixture.logSource, 'a.log'),
      });
      expect(progress.mock.calls.at(-1)?.[0]).toEqual({
        filesTotal: 2,
        filesDone: 2,
      });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('defers a partial trailing record until its line is complete', async () => {
    const fixture = await createPipelineFixture();
    const sessionPath = join(fixture.logSource, 'partial.log');
    const complete = { key: 'p-1', cwd: '/repo/one', timestamp: BASE };
    const deferred = { key: 'p-2', cwd: '/repo/one', timestamp: BASE + 1_000 };
    await writeLines(sessionPath, [complete, deferred], {
      trailingNewline: false,
    });

    try {
      await runPipeline(createFakeAdapter(), fixture.database);
      expect(fixture.database.select().from(interactions).all()).toMatchObject([
        { interactionKey: 'p-1' },
      ]);
      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        lastCompleteRecordByteOffset: Buffer.byteLength(
          `${JSON.stringify(complete)}\n`,
        ),
      });

      await writeLines(sessionPath, [complete, deferred]);
      await runPipeline(createFakeAdapter(), fixture.database);
      expect(
        fixture.database
          .select({ key: interactions.interactionKey })
          .from(interactions)
          .orderBy(interactions.interactionKey)
          .all(),
      ).toEqual([{ key: 'p-1' }, { key: 'p-2' }]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('skips consumed bytes, skips unchanged files, and resumes at the last boundary', async () => {
    const fixture = await createPipelineFixture();
    const sessionPath = join(fixture.logSource, 'growth.log');
    await writeLines(sessionPath, [
      { key: 'g-1', cwd: '/repo/one', timestamp: BASE, main: { output: 1 } },
      {
        key: 'g-2',
        cwd: '/repo/one',
        timestamp: BASE + 1_000,
        main: { output: 2 },
      },
    ]);
    const log = vi.fn();

    try {
      await runPipeline(createFakeAdapter(), fixture.database);
      fixture.database
        .update(interactions)
        .set({ model: 'sentinel-not-reparsed' })
        .run();

      await runPipeline(createFakeAdapter(), fixture.database, { log });
      expect(log).toHaveBeenCalledWith(`Skipped unchanged ${sessionPath}`);
      expect(fixture.database.select().from(interactions).all()).toMatchObject([
        { interactionKey: 'g-1', model: 'sentinel-not-reparsed' },
        { interactionKey: 'g-2', model: 'sentinel-not-reparsed' },
      ]);

      await appendFile(
        sessionPath,
        `${JSON.stringify({ key: 'g-3', cwd: '/repo/one', timestamp: BASE + 2_000 })}\n`,
      );
      await runPipeline(createFakeAdapter(), fixture.database);

      const stored = fixture.database
        .select()
        .from(interactions)
        .orderBy(interactions.interactionKey)
        .all();
      // The resumed slice starts at the last boundary, so g-1 is genuinely
      // consumed while g-2 is re-parsed and overwrites its stored row.
      expect(stored).toMatchObject([
        { interactionKey: 'g-1', model: 'sentinel-not-reparsed' },
        { interactionKey: 'g-2', model: 'fake-model' },
        { interactionKey: 'g-3' },
      ]);
      const grown = await stat(sessionPath);
      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        lastCompleteRecordByteOffset: grown.size,
        fileSize: grown.size,
      });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('rewrites a re-emitted Interaction to identical values, sub-tokens included', async () => {
    const fixture = await createPipelineFixture();
    const sessionPath = join(fixture.logSource, 'folded.log');
    const auxiliaryPath = join(fixture.logSource, 'folded.aux');
    await writeLines(sessionPath, [
      { key: 'f-1', cwd: '/repo/one', timestamp: BASE, main: { output: 1 } },
      {
        key: 'f-2',
        cwd: '/repo/one',
        timestamp: BASE + 1_000,
        main: { output: 2 },
      },
    ]);
    await writeLines(auxiliaryPath, [
      '{"update":"f-1","sub":{"output":9}}',
      '{"update":"f-2","sub":{"output":3}}',
    ]);
    // An auxiliary file defeats the unchanged-file shortcut, so every run
    // re-emits the Interaction the resume boundary sweeps back into the window.
    const adapter = createFakeAdapter({
      enumerate: async () => [
        { primaryFilePath: sessionPath, auxiliaryFilePaths: [auxiliaryPath] },
      ],
    });

    try {
      await runPipeline(adapter, fixture.database);
      const afterFirstRun = fixture.database
        .select()
        .from(interactions)
        .orderBy(interactions.interactionKey)
        .all();
      expect(afterFirstRun).toMatchObject([
        { interactionKey: 'f-1', mainOutputTokens: 1, subOutputTokens: 9 },
        { interactionKey: 'f-2', mainOutputTokens: 2, subOutputTokens: 3 },
      ]);

      // Degrade only the Interaction the boundary sweeps back in: run two must
      // restore it exactly, leaving the consumed Interaction before it alone.
      fixture.database
        .update(interactions)
        .set({ model: 'sentinel-overwritten', subOutputTokens: null })
        .where(eq(interactions.interactionKey, 'f-2'))
        .run();
      await runPipeline(adapter, fixture.database);

      expect(
        fixture.database
          .select()
          .from(interactions)
          .orderBy(interactions.interactionKey)
          .all(),
      ).toEqual(afterFirstRun);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('re-reads the whole primary when the adapter reports no earlier boundary', async () => {
    const fixture = await createPipelineFixture();
    const sessionPath = join(fixture.logSource, 'no-boundary.log');
    await writeLines(sessionPath, [
      { key: 'n-1', cwd: '/repo/one', timestamp: BASE, main: { output: 1 } },
    ]);
    const adapter = createFakeAdapter({
      findResumeBoundary: (_contents, _beforeByteOffset, metadata) => ({
        byteOffset: 0,
        metadata,
      }),
    });

    try {
      await runPipeline(adapter, fixture.database);
      fixture.database
        .update(interactions)
        .set({ model: 'sentinel-not-reparsed' })
        .run();
      await appendFile(
        sessionPath,
        `${JSON.stringify({ key: 'n-2', cwd: '/repo/one', timestamp: BASE + 1_000 })}\n`,
      );
      await runPipeline(adapter, fixture.database);

      expect(
        fixture.database
          .select()
          .from(interactions)
          .orderBy(interactions.interactionKey)
          .all(),
      ).toMatchObject([
        { interactionKey: 'n-1', model: 'fake-model' },
        { interactionKey: 'n-2', model: 'fake-model' },
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('threads refined boundary metadata into the slice but not the sub-token pass', async () => {
    const fixture = await createPipelineFixture();
    const sessionPath = join(fixture.logSource, 'refined.log');
    await writeLines(sessionPath, [
      { key: 'r-1', cwd: '/repo/one', timestamp: BASE, main: { output: 1 } },
    ]);
    const subTokenMetadata: unknown[] = [];
    const adapter = createFakeAdapter({
      findResumeBoundary: (_contents, _beforeByteOffset, metadata) => ({
        byteOffset: 0,
        metadata: { ...metadata, outputTokenBase: 100 },
      }),
      readSubTokenUpdates: (input) => {
        subTokenMetadata.push(input.metadata);
        return [];
      },
    });

    try {
      await runPipeline(adapter, fixture.database);
      await appendFile(
        sessionPath,
        `${JSON.stringify({ key: 'r-2', cwd: '/repo/one', timestamp: BASE + 1_000, main: { output: 2 } })}\n`,
      );
      await runPipeline(adapter, fixture.database);

      expect(
        fixture.database
          .select({
            interactionKey: interactions.interactionKey,
            mainOutputTokens: interactions.mainOutputTokens,
          })
          .from(interactions)
          .orderBy(interactions.interactionKey)
          .all(),
      ).toEqual([
        { interactionKey: 'r-1', mainOutputTokens: 101 },
        { interactionKey: 'r-2', mainOutputTokens: 102 },
      ]);
      expect(subTokenMetadata).toEqual([
        { stableSessionId: 'refined' },
        { stableSessionId: 'refined' },
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('atomically replaces obsolete Interactions when the primary file resets', async () => {
    const fixture = await createPipelineFixture();
    const sessionPath = join(fixture.logSource, 'reset.log');
    await writeLines(sessionPath, [
      { key: 'old-1', cwd: '/repo/one', timestamp: BASE },
      { key: 'old-2', cwd: '/repo/one', timestamp: BASE + 1_000 },
    ]);

    try {
      await runPipeline(createFakeAdapter(), fixture.database);
      const initial = await stat(sessionPath);

      await writeLines(sessionPath, [
        { key: 'fresh', cwd: '/repo/one', timestamp: BASE + 2_000 },
      ]);
      await utimes(
        sessionPath,
        initial.atime,
        new Date(initial.mtimeMs + 2_000),
      );
      await runPipeline(createFakeAdapter(), fixture.database);

      expect(fixture.database.select().from(interactions).all()).toMatchObject([
        { interactionKey: 'fresh' },
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('archives raw bytes before parsing even when parsing fails', async () => {
    const fixture = await createPipelineFixture();
    const archiveRoot = join(fixture.root, 'raw-archive');
    const sessionPath = join(fixture.logSource, 'broken.log');
    await writeFile(sessionPath, 'not valid json\n');
    persistSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
    });

    try {
      await expect(
        runPipeline(createFakeAdapter(), fixture.database),
      ).rejects.toThrow();
      await expect(
        readFile(archivePath(archiveRoot, sessionPath)),
      ).resolves.toEqual(Buffer.from('not valid json\n'));
    } finally {
      fixture.sqlite.close();
    }
  });

  it('skips an archive with matching metadata and replaces a changed one', async () => {
    const fixture = await createPipelineFixture();
    const archiveRoot = join(fixture.root, 'raw-archive');
    const sessionPath = join(fixture.logSource, 'archived.log');
    await writeLines(sessionPath, [
      { key: 'arch-1', cwd: '/repo/one', timestamp: BASE },
    ]);
    persistSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
    });

    try {
      await runPipeline(createFakeAdapter(), fixture.database);
      const archived = archivePath(archiveRoot, sessionPath);
      const sourceStat = await stat(sessionPath);
      const sentinel = Buffer.alloc(sourceStat.size, 122);
      await writeFile(archived, sentinel);
      const matching = new Date('2026-01-01T00:00:00.000Z');
      await utimes(sessionPath, matching, matching);
      await utimes(archived, matching, matching);

      await runPipeline(createFakeAdapter(), fixture.database);
      await expect(readFile(archived)).resolves.toEqual(sentinel);

      await appendFile(
        sessionPath,
        `${JSON.stringify({ key: 'arch-2', cwd: '/repo/one', timestamp: BASE + 1_000 })}\n`,
      );
      const changed = new Date(matching.getTime() + 2_000);
      await utimes(sessionPath, changed, changed);
      await runPipeline(createFakeAdapter(), fixture.database);
      await expect(readFile(archived)).resolves.toEqual(
        await readFile(sessionPath),
      );
    } finally {
      fixture.sqlite.close();
    }
  });

  it('keeps identical relative paths from separate sources collision-free', async () => {
    const fixture = await createPipelineFixture();
    const archiveRoot = join(fixture.root, 'raw-archive');
    const secondSource = join(fixture.root, 'second-source');
    await writeLines(join(fixture.logSource, 'shared.log'), [
      { key: 'first', cwd: '/repo/one', timestamp: BASE },
    ]);
    await mkdir(secondSource, { recursive: true });
    await writeLines(join(secondSource, 'shared.log'), [
      { key: 'second', cwd: '/repo/two', timestamp: BASE + 1_000 },
    ]);
    persistSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
      logSourceOverrides: { [FAKE_HARNESS]: [fixture.logSource, secondSource] },
    });
    const firstPath = join(fixture.logSource, 'shared.log');
    const secondPath = join(secondSource, 'shared.log');
    const adapter = createFakeAdapter({
      identify: (primaryFilePath) => ({
        stableSessionId: primaryFilePath,
        metadata: { stableSessionId: primaryFilePath },
      }),
    });

    try {
      await runPipeline(adapter, fixture.database);

      expect(archivePath(archiveRoot, firstPath)).not.toBe(
        archivePath(archiveRoot, secondPath),
      );
      await expect(
        readFile(archivePath(archiveRoot, firstPath)),
      ).resolves.toEqual(await readFile(firstPath));
      await expect(
        readFile(archivePath(archiveRoot, secondPath)),
      ).resolves.toEqual(await readFile(secondPath));
    } finally {
      fixture.sqlite.close();
    }
  });

  it('rejects an enabled archive without a configured path', async () => {
    const fixture = await createPipelineFixture();
    await writeLines(join(fixture.logSource, 'a.log'), [
      { key: 'a-1', cwd: '/repo/one', timestamp: BASE },
    ]);
    persistSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: null,
    });

    try {
      await expect(
        runPipeline(createFakeAdapter(), fixture.database),
      ).rejects.toThrow(
        'Raw archive is enabled but no archive path is configured',
      );
    } finally {
      fixture.sqlite.close();
    }
  });

  it('removes the temporary archive file when the rename fails', async () => {
    const fixture = await createPipelineFixture();
    const archiveRoot = join(fixture.root, 'raw-archive');
    const sessionPath = join(fixture.logSource, 'rename-fail.log');
    await writeLines(sessionPath, [
      { key: 'rf-1', cwd: '/repo/one', timestamp: BASE },
    ]);
    persistSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
    });

    try {
      await expect(
        runPipeline(createFakeAdapter(), fixture.database, {
          renameArchivedFile: async () => {
            throw new Error('Injected archive rename failure');
          },
        }),
      ).rejects.toThrow('Injected archive rename failure');

      const destination = archivePath(archiveRoot, sessionPath);
      await expect(readFile(destination)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      const entries = await readdir(dirname(destination));
      expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('re-ingests idempotently, never duplicating a Session, Interaction or Project', async () => {
    const fixture = await createPipelineFixture();
    const sessionPath = join(fixture.logSource, 'dedup.log');
    await writeLines(sessionPath, [
      { key: 'd-1', cwd: '/repo/one', timestamp: BASE, main: { output: 1 } },
    ]);

    try {
      await runPipeline(createFakeAdapter(), fixture.database);
      const initial = await stat(sessionPath);
      await writeLines(sessionPath, [
        { key: 'd-1', cwd: '/repo/one', timestamp: BASE, main: { output: 5 } },
      ]);
      await utimes(
        sessionPath,
        initial.atime,
        new Date(initial.mtimeMs + 2_000),
      );
      await runPipeline(createFakeAdapter(), fixture.database);

      expect(fixture.database.select().from(sessions).all()).toHaveLength(1);
      expect(fixture.database.select().from(projects).all()).toHaveLength(1);
      expect(fixture.database.select().from(interactions).all()).toMatchObject([
        { interactionKey: 'd-1', mainOutputTokens: 5 },
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('derives a Session Project from the sole common Interaction Project', async () => {
    const fixture = await createPipelineFixture();
    await writeLines(join(fixture.logSource, 'homogeneous.log'), [
      { key: 'h-1', cwd: '/repo/one', timestamp: BASE },
      { key: 'h-2', cwd: '/repo/one', timestamp: BASE + 1_000 },
    ]);

    try {
      await runPipeline(createFakeAdapter(), fixture.database);
      const project = fixture.database.select().from(projects).get();
      const session = fixture.database.select().from(sessions).get();
      expect(session?.projectId).toBe(project?.id);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('nulls a Session Project spanning heterogeneous Interaction Projects', async () => {
    const fixture = await createPipelineFixture();
    await writeLines(join(fixture.logSource, 'heterogeneous.log'), [
      { key: 'x-1', cwd: '/repo/one', timestamp: BASE },
      { key: 'x-2', cwd: '/repo/two', timestamp: BASE + 1_000 },
    ]);

    try {
      await runPipeline(createFakeAdapter(), fixture.database);
      const session = fixture.database.select().from(sessions).get();
      expect(session?.projectId).toBeNull();
      const stored = fixture.database
        .select({
          key: interactions.interactionKey,
          projectId: interactions.projectId,
        })
        .from(interactions)
        .orderBy(interactions.interactionKey)
        .all();
      expect(stored[0].projectId).not.toBe(stored[1].projectId);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('stores absent token buckets as null, distinct from a genuine zero', async () => {
    const fixture = await createPipelineFixture();
    await writeLines(join(fixture.logSource, 'buckets.log'), [
      { key: 'n-1', cwd: '/repo/one', timestamp: BASE, main: { input: 0 } },
    ]);

    try {
      await runPipeline(createFakeAdapter(), fixture.database);
      expect(fixture.database.select().from(interactions).get()).toMatchObject({
        mainInputTokens: 0,
        mainOutputTokens: null,
        mainCacheReadTokens: null,
        subInputTokens: null,
        subOutputTokens: null,
      });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('re-reads auxiliary files each run and folds their sub-token updates', async () => {
    const fixture = await createPipelineFixture();
    const primaryPath = join(fixture.logSource, 'primary.log');
    const auxiliaryPath = join(fixture.logSource, 'primary.aux');
    await writeLines(primaryPath, [
      {
        key: 'main-1',
        cwd: '/repo/one',
        timestamp: BASE,
        spawnedSubagents: true,
      },
    ]);
    await writeLines(auxiliaryPath, [
      JSON.stringify({ update: 'main-1', sub: { input: 4, output: 5 } }),
    ]);
    const adapter = createFakeAdapter({
      enumerate: async () => [
        { primaryFilePath: primaryPath, auxiliaryFilePaths: [auxiliaryPath] },
      ],
    });

    try {
      await runPipeline(adapter, fixture.database);
      expect(fixture.database.select().from(interactions).get()).toMatchObject({
        interactionKey: 'main-1',
        spawnedSubagents: true,
        subInputTokens: 4,
        subOutputTokens: 5,
      });

      // The primary is byte-for-byte unchanged, but a present auxiliary file
      // must defeat the unchanged-skip guard so its tokens re-fold idempotently.
      await runPipeline(adapter, fixture.database);
      expect(fixture.database.select().from(interactions).all()).toMatchObject([
        { interactionKey: 'main-1', subInputTokens: 4, subOutputTokens: 5 },
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('collapses one Project for a shared root path, keeping the git remote display-only', async () => {
    const fixture = await createPipelineFixture();
    await writeLines(join(fixture.logSource, 'identity.log'), [
      { key: 'id-1', cwd: '/checkout/worktree-a', timestamp: BASE },
      { key: 'id-2', cwd: '/checkout/worktree-b', timestamp: BASE + 1_000 },
    ]);
    const resolveProject: CwdProjectResolver = async (cwd) => ({
      rootPath: '/checkout/root',
      gitRemoteUrl:
        cwd === '/checkout/worktree-b'
          ? 'git@example.com:owner/project.git'
          : null,
    });

    try {
      await runPipeline(createFakeAdapter(), fixture.database, {
        resolveProject,
      });

      const storedProjects = fixture.database.select().from(projects).all();
      expect(storedProjects).toHaveLength(1);
      expect(storedProjects[0]).toMatchObject({
        rootPath: '/checkout/root',
        gitRemoteUrl: 'git@example.com:owner/project.git',
      });
      const attributed = fixture.database
        .select({ projectId: interactions.projectId })
        .from(interactions)
        .all();
      expect(new Set(attributed.map((row) => row.projectId))).toEqual(
        new Set([storedProjects[0].id]),
      );
    } finally {
      fixture.sqlite.close();
    }
  });
});

function archivePath(archiveRoot: string, sourcePath: string): string {
  const absoluteSource = resolve(sourcePath);
  const filesystemRoot = parse(absoluteSource).root;
  return join(
    archiveRoot,
    FAKE_HARNESS,
    Buffer.from(filesystemRoot).toString('base64url'),
    relative(filesystemRoot, absoluteSource),
  );
}
