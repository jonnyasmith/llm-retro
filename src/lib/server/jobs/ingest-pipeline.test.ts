import {
  appendFile,
  readFile,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkpoints,
  interactions,
  projects,
  sessions,
} from '../database/schema';
import { persistSettings } from '../database/store';
import type { IngestAdapter } from './ingest-pipeline';
import type { CwdProjectResolver } from './project-resolver';
import {
  FAKE_HARNESS,
  cleanupPipelineFixtures,
  createFakeAdapter,
  createPipelineFixture,
  runPipeline,
  writeLines,
  type FakeMetadata,
  type PipelineFixture,
} from './ingest-pipeline-fixture';
import { rawArchiveDestination } from './raw-archive';

const BASE = Date.parse('2025-01-01T10:00:00.000Z');

let fixture: PipelineFixture;

beforeEach(async () => {
  fixture = await createPipelineFixture();
});

afterEach(async () => {
  fixture.close();
  await cleanupPipelineFixtures();
});

/** Every stored Interaction, in a stable order. */
function storedInteractions(): (typeof interactions.$inferSelect)[] {
  return fixture.database
    .select()
    .from(interactions)
    .orderBy(interactions.interactionKey)
    .all();
}

/** The key of every stored Interaction, in a stable order. */
function storedInteractionKeys() {
  return fixture.database
    .select({ key: interactions.interactionKey })
    .from(interactions)
    .orderBy(interactions.interactionKey)
    .all();
}

describe('Ingest pipeline', () => {
  describe('on a first ingest, with no checkpoint stored', () => {
    describe('across every file the Harness adapter enumerates', () => {
      const progress = vi.fn();

      beforeEach(async () => {
        progress.mockReset();
        await writeLines(join(fixture.logSource, 'a.log'), [
          {
            key: 'a-1',
            cwd: '/repo/one',
            timestamp: BASE,
            main: { output: 3 },
          },
          { key: 'a-2', cwd: '/repo/one', timestamp: BASE + 1_000 },
        ]);
        await writeLines(join(fixture.logSource, 'b.log'), [
          { key: 'b-1', cwd: '/repo/two', timestamp: BASE + 2_000 },
        ]);
        await runPipeline(createFakeAdapter(), fixture.database, { progress });
      });

      it('stores a Session for each of them', () => {
        expect(fixture.database.select().from(sessions).all()).toHaveLength(2);
      });

      it('stores an Interaction for every record they describe', () => {
        expect(storedInteractionKeys()).toEqual([
          { key: 'a-1' },
          { key: 'a-2' },
          { key: 'b-1' },
        ]);
      });

      it('stores a Project for every working directory their Interactions name', () => {
        expect(
          fixture.database
            .select({ rootPath: projects.rootPath })
            .from(projects)
            .orderBy(projects.rootPath)
            .all(),
        ).toEqual([{ rootPath: '/repo/one' }, { rootPath: '/repo/two' }]);
      });

      it('reports how many files it found before it reads any of them', () => {
        expect(progress).toHaveBeenCalledWith({ filesTotal: 2, filesDone: 0 });
      });

      it('names each file as it reaches it', () => {
        expect(progress).toHaveBeenCalledWith({
          filesTotal: 2,
          filesDone: 0,
          currentFile: join(fixture.logSource, 'a.log'),
        });
      });

      it('reports every file done once it has finished', () => {
        expect(progress.mock.calls.at(-1)?.[0]).toEqual({
          filesTotal: 2,
          filesDone: 2,
        });
      });
    });

    describe('of a file whose final line has no terminator', () => {
      const complete = { key: 'p-1', cwd: '/repo/one', timestamp: BASE };
      const deferred = {
        key: 'p-2',
        cwd: '/repo/one',
        timestamp: BASE + 1_000,
      };
      let sessionPath: string;

      beforeEach(async () => {
        sessionPath = join(fixture.logSource, 'partial.log');
        await writeLines(sessionPath, [complete, deferred], {
          trailingNewline: false,
        });
        await runPipeline(createFakeAdapter(), fixture.database);
      });

      it('defers the Interaction that partial trailing record describes', () => {
        expect(
          fixture.database.select().from(interactions).all(),
        ).toMatchObject([{ interactionKey: 'p-1' }]);
      });

      it('checkpoints the byte offset of the last complete record', () => {
        expect(fixture.database.select().from(checkpoints).get()).toMatchObject(
          {
            lastCompleteRecordByteOffset: Buffer.byteLength(
              `${JSON.stringify(complete)}\n`,
            ),
          },
        );
      });

      describe('and that is completed before the next run', () => {
        beforeEach(async () => {
          await writeLines(sessionPath, [complete, deferred]);
          await runPipeline(createFakeAdapter(), fixture.database);
        });

        it('stores the once-deferred Interaction beside the first', () => {
          expect(storedInteractionKeys()).toEqual([
            { key: 'p-1' },
            { key: 'p-2' },
          ]);
        });
      });
    });

    describe('of a file reporting only some of its token buckets', () => {
      beforeEach(async () => {
        await writeLines(join(fixture.logSource, 'buckets.log'), [
          { key: 'n-1', cwd: '/repo/one', timestamp: BASE, main: { input: 0 } },
        ]);
        await runPipeline(createFakeAdapter(), fixture.database);
      });

      it('stores a reported zero as a genuine zero', () => {
        expect(
          fixture.database.select().from(interactions).get(),
        ).toMatchObject({ mainInputTokens: 0 });
      });

      it.each([
        'mainOutputTokens',
        'mainCacheReadTokens',
        'subInputTokens',
        'subOutputTokens',
      ] as const)('stores the absent %s bucket as null', (bucket) => {
        expect(
          fixture.database.select().from(interactions).get()?.[bucket],
        ).toBeNull();
      });
    });

    describe('of a file whose Interactions all name one working directory', () => {
      beforeEach(async () => {
        await writeLines(join(fixture.logSource, 'homogeneous.log'), [
          { key: 'h-1', cwd: '/repo/one', timestamp: BASE },
          { key: 'h-2', cwd: '/repo/one', timestamp: BASE + 1_000 },
        ]);
        await runPipeline(createFakeAdapter(), fixture.database);
      });

      it('derives the Session Project from the sole Project they share', () => {
        const project = fixture.database.select().from(projects).get();
        const session = fixture.database.select().from(sessions).get();
        expect(session?.projectId).toBe(project?.id);
      });
    });

    describe('of a file whose Interactions name heterogeneous working directories', () => {
      beforeEach(async () => {
        await writeLines(join(fixture.logSource, 'heterogeneous.log'), [
          { key: 'x-1', cwd: '/repo/one', timestamp: BASE },
          { key: 'x-2', cwd: '/repo/two', timestamp: BASE + 1_000 },
        ]);
        await runPipeline(createFakeAdapter(), fixture.database);
      });

      it('leaves the Session without a Project of its own', () => {
        expect(
          fixture.database.select().from(sessions).get()?.projectId,
        ).toBeNull();
      });

      it('attributes each Interaction to the Project of its own working directory', () => {
        const stored = fixture.database
          .select({
            key: interactions.interactionKey,
            projectId: interactions.projectId,
          })
          .from(interactions)
          .orderBy(interactions.interactionKey)
          .all();
        expect(stored[0].projectId).not.toBe(stored[1].projectId);
      });
    });

    describe('of a file whose working directories resolve to a shared root path', () => {
      const resolveProject: CwdProjectResolver = async (cwd) => ({
        rootPath: '/checkout/root',
        gitRemoteUrl:
          cwd === '/checkout/worktree-b'
            ? 'git@example.com:owner/project.git'
            : null,
      });

      beforeEach(async () => {
        await writeLines(join(fixture.logSource, 'identity.log'), [
          { key: 'id-1', cwd: '/checkout/worktree-a', timestamp: BASE },
          { key: 'id-2', cwd: '/checkout/worktree-b', timestamp: BASE + 1_000 },
        ]);
        await runPipeline(createFakeAdapter(), fixture.database, {
          resolveProject,
        });
      });

      it('collapses them into one Project for that root path', () => {
        const storedProjects = fixture.database.select().from(projects).all();
        expect(storedProjects).toHaveLength(1);
        expect(storedProjects[0]).toMatchObject({ rootPath: '/checkout/root' });
      });

      it('keeps the git remote resolved for that root path, display-only', () => {
        expect(fixture.database.select().from(projects).get()).toMatchObject({
          gitRemoteUrl: 'git@example.com:owner/project.git',
        });
      });

      it('attributes every Interaction to that one Project', () => {
        const project = fixture.database.select().from(projects).get();
        const attributed = fixture.database
          .select({ projectId: interactions.projectId })
          .from(interactions)
          .all();
        expect(new Set(attributed.map((row) => row.projectId))).toEqual(
          new Set([project?.id]),
        );
      });
    });

    describe('of a file the Harness adapter cannot identify, with the Raw archive enabled', () => {
      let archiveRoot: string;
      let sessionPath: string;
      let adapter: IngestAdapter<FakeMetadata>;

      beforeEach(async () => {
        archiveRoot = join(fixture.root, 'raw-archive');
        sessionPath = join(fixture.logSource, 'broken.log');
        await writeFile(sessionPath, 'not valid json\n');
        persistSettings(fixture.database, {
          rawArchiveEnabled: true,
          rawArchivePath: archiveRoot,
        });
        // Codex, pi and omp all identify a Session by parsing the file's first
        // record, so a malformed file throws here — before any parse of the
        // slice.
        adapter = createFakeAdapter({
          identify: () => {
            throw new Error('Unreadable session metadata');
          },
        });
      });

      it('reports the failure the Harness adapter raised', async () => {
        await expect(runPipeline(adapter, fixture.database)).rejects.toThrow(
          'Unreadable session metadata',
        );
      });

      it('has already archived the source file the adapter never read', async () => {
        await runPipeline(adapter, fixture.database).catch(() => {});

        await expect(
          readFile(
            rawArchiveDestination(archiveRoot, FAKE_HARNESS, sessionPath),
          ),
        ).resolves.toEqual(Buffer.from('not valid json\n'));
      });
    });
  });

  describe('re-running over a primary file unchanged since its checkpoint', () => {
    const log = vi.fn();
    let sessionPath: string;

    beforeEach(async () => {
      log.mockReset();
      sessionPath = join(fixture.logSource, 'growth.log');
      await writeLines(sessionPath, [
        { key: 'g-1', cwd: '/repo/one', timestamp: BASE, main: { output: 1 } },
        {
          key: 'g-2',
          cwd: '/repo/one',
          timestamp: BASE + 1_000,
          main: { output: 2 },
        },
      ]);
      await runPipeline(createFakeAdapter(), fixture.database);
      fixture.database
        .update(interactions)
        .set({ model: 'sentinel-not-reparsed' })
        .run();
      await runPipeline(createFakeAdapter(), fixture.database, { log });
    });

    it('logs that it skipped the file', () => {
      expect(log).toHaveBeenCalledWith(`Skipped unchanged ${sessionPath}`);
    });

    it('leaves the stored Interactions exactly as the last run left them', () => {
      expect(storedInteractions()).toMatchObject([
        { interactionKey: 'g-1', model: 'sentinel-not-reparsed' },
        { interactionKey: 'g-2', model: 'sentinel-not-reparsed' },
      ]);
    });
  });

  describe('re-running over a primary file grown beyond its checkpoint', () => {
    let sessionPath: string;

    beforeEach(async () => {
      sessionPath = join(fixture.logSource, 'growth.log');
      await writeLines(sessionPath, [
        { key: 'g-1', cwd: '/repo/one', timestamp: BASE, main: { output: 1 } },
        {
          key: 'g-2',
          cwd: '/repo/one',
          timestamp: BASE + 1_000,
          main: { output: 2 },
        },
      ]);
      await runPipeline(createFakeAdapter(), fixture.database);
      fixture.database
        .update(interactions)
        .set({ model: 'sentinel-not-reparsed' })
        .run();
      await appendFile(
        sessionPath,
        `${JSON.stringify({ key: 'g-3', cwd: '/repo/one', timestamp: BASE + 2_000 })}\n`,
      );
      await runPipeline(createFakeAdapter(), fixture.database);
    });

    // The resumed slice starts at the last boundary, so g-1 is genuinely
    // consumed while g-2 is re-parsed and overwrites its stored row.
    it('leaves an Interaction consumed before the boundary untouched', () => {
      expect(storedInteractions()[0]).toMatchObject({
        interactionKey: 'g-1',
        model: 'sentinel-not-reparsed',
      });
    });

    it('re-parses the Interaction the boundary sweeps back in', () => {
      expect(storedInteractions()[1]).toMatchObject({
        interactionKey: 'g-2',
        model: 'fake-model',
      });
    });

    it('stores the Interaction the appended bytes describe', () => {
      expect(storedInteractions()[2]).toMatchObject({
        interactionKey: 'g-3',
      });
    });

    it('checkpoints the grown file as consumed to its end', async () => {
      const grown = await stat(sessionPath);
      expect(fixture.database.select().from(checkpoints).get()).toMatchObject({
        lastCompleteRecordByteOffset: grown.size,
        fileSize: grown.size,
      });
    });
  });

  describe('re-running over a primary file rewritten since its checkpoint', () => {
    describe('to describe different Interactions', () => {
      beforeEach(async () => {
        const sessionPath = join(fixture.logSource, 'reset.log');
        await writeLines(sessionPath, [
          { key: 'old-1', cwd: '/repo/one', timestamp: BASE },
          { key: 'old-2', cwd: '/repo/one', timestamp: BASE + 1_000 },
        ]);
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
      });

      it('atomically replaces the obsolete Interactions', () => {
        expect(
          fixture.database.select().from(interactions).all(),
        ).toMatchObject([{ interactionKey: 'fresh' }]);
      });
    });

    describe('to re-emit the same Interaction with new values', () => {
      beforeEach(async () => {
        const sessionPath = join(fixture.logSource, 'dedup.log');
        await writeLines(sessionPath, [
          {
            key: 'd-1',
            cwd: '/repo/one',
            timestamp: BASE,
            main: { output: 1 },
          },
        ]);
        await runPipeline(createFakeAdapter(), fixture.database);
        const initial = await stat(sessionPath);
        await writeLines(sessionPath, [
          {
            key: 'd-1',
            cwd: '/repo/one',
            timestamp: BASE,
            main: { output: 5 },
          },
        ]);
        await utimes(
          sessionPath,
          initial.atime,
          new Date(initial.mtimeMs + 2_000),
        );
        await runPipeline(createFakeAdapter(), fixture.database);
      });

      it('never duplicates the Session', () => {
        expect(fixture.database.select().from(sessions).all()).toHaveLength(1);
      });

      it('never duplicates the Project', () => {
        expect(fixture.database.select().from(projects).all()).toHaveLength(1);
      });

      it('never duplicates the Interaction', () => {
        expect(fixture.database.select().from(interactions).all()).toHaveLength(
          1,
        );
      });

      it('rewrites the Interaction to its new values', () => {
        expect(
          fixture.database.select().from(interactions).all(),
        ).toMatchObject([{ interactionKey: 'd-1', mainOutputTokens: 5 }]);
      });
    });
  });

  describe('resuming a grown primary for which the Harness adapter reports no earlier boundary', () => {
    beforeEach(async () => {
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
    });

    it('re-reads the whole primary, re-parsing every Interaction in it', () => {
      expect(storedInteractions()).toMatchObject([
        { interactionKey: 'n-1', model: 'fake-model' },
        { interactionKey: 'n-2', model: 'fake-model' },
      ]);
    });
  });

  describe('resuming a grown primary whose Harness adapter refines the boundary metadata', () => {
    let subTokenMetadata: unknown[];

    beforeEach(async () => {
      subTokenMetadata = [];
      const sessionPath = join(fixture.logSource, 'refined.log');
      await writeLines(sessionPath, [
        { key: 'r-1', cwd: '/repo/one', timestamp: BASE, main: { output: 1 } },
      ]);
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
      await runPipeline(adapter, fixture.database);
      await appendFile(
        sessionPath,
        `${JSON.stringify({ key: 'r-2', cwd: '/repo/one', timestamp: BASE + 1_000, main: { output: 2 } })}\n`,
      );
      await runPipeline(adapter, fixture.database);
    });

    it('threads the refined metadata into the slice it parses', () => {
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
    });

    it('leaves the sub-token pass the metadata that identified the Session', () => {
      expect(subTokenMetadata).toEqual([
        { stableSessionId: 'refined' },
        { stableSessionId: 'refined' },
      ]);
    });
  });

  describe('ingesting a primary file accompanied by an auxiliary file', () => {
    describe('carrying sub-token updates for its Interaction', () => {
      let adapter: IngestAdapter<FakeMetadata>;

      beforeEach(async () => {
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
        adapter = createFakeAdapter({
          enumerate: async () => [
            {
              primaryFilePath: primaryPath,
              auxiliaryFilePaths: [auxiliaryPath],
            },
          ],
        });
        await runPipeline(adapter, fixture.database);
      });

      it('folds its sub-token updates into the Interaction', () => {
        expect(
          fixture.database.select().from(interactions).get(),
        ).toMatchObject({
          interactionKey: 'main-1',
          subInputTokens: 4,
          subOutputTokens: 5,
        });
      });

      it('records that the Interaction spawned subagents', () => {
        expect(
          fixture.database.select().from(interactions).get(),
        ).toMatchObject({ spawnedSubagents: true });
      });

      describe('and re-run with the primary byte-for-byte unchanged', () => {
        beforeEach(async () => {
          await runPipeline(adapter, fixture.database);
        });

        // The primary is byte-for-byte unchanged, but a present auxiliary file
        // must defeat the unchanged-skip guard so its tokens re-fold
        // idempotently.
        it('folds the same sub-tokens onto the Interaction again', () => {
          expect(
            fixture.database.select().from(interactions).all(),
          ).toMatchObject([
            { interactionKey: 'main-1', subInputTokens: 4, subOutputTokens: 5 },
          ]);
        });
      });
    });

    // An auxiliary file defeats the unchanged-file shortcut, so every run
    // re-emits the Interaction the resume boundary sweeps back into the window.
    describe('that re-emits the Interaction the resume boundary sweeps back in', () => {
      let adapter: IngestAdapter<FakeMetadata>;
      let afterFirstRun: (typeof interactions.$inferSelect)[];

      beforeEach(async () => {
        const sessionPath = join(fixture.logSource, 'folded.log');
        const auxiliaryPath = join(fixture.logSource, 'folded.aux');
        await writeLines(sessionPath, [
          {
            key: 'f-1',
            cwd: '/repo/one',
            timestamp: BASE,
            main: { output: 1 },
          },
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
        adapter = createFakeAdapter({
          enumerate: async () => [
            {
              primaryFilePath: sessionPath,
              auxiliaryFilePaths: [auxiliaryPath],
            },
          ],
        });
        await runPipeline(adapter, fixture.database);
        afterFirstRun = storedInteractions();
      });

      it('stores each Interaction with its main and its folded sub-tokens', () => {
        expect(afterFirstRun).toMatchObject([
          { interactionKey: 'f-1', mainOutputTokens: 1, subOutputTokens: 9 },
          { interactionKey: 'f-2', mainOutputTokens: 2, subOutputTokens: 3 },
        ]);
      });

      // Degrade only the Interaction the boundary sweeps back in: run two must
      // restore it exactly, leaving the consumed Interaction before it alone.
      describe('once that Interaction has been degraded in the Store', () => {
        beforeEach(async () => {
          fixture.database
            .update(interactions)
            .set({ model: 'sentinel-overwritten', subOutputTokens: null })
            .where(eq(interactions.interactionKey, 'f-2'))
            .run();
          await runPipeline(adapter, fixture.database);
        });

        it('rewrites it to identical values, sub-tokens included', () => {
          expect(storedInteractions()).toEqual(afterFirstRun);
        });
      });
    });
  });
});
