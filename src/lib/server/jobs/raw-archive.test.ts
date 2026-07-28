import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Harness } from '../../jobs/contracts';
import type { ApplicationSettings } from '../../settings/contracts';
import {
  createRawArchive,
  rawArchiveDestination,
  type RawArchive,
} from './raw-archive';
import { readStableSourceFile } from './source-file-read';

// The archive treats the Harness as an opaque directory name, so any member of
// the closed union serves.
const HARNESS: Harness = 'claude';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Raw archive', () => {
  describe('an archive that is switched off', () => {
    it('is constructed even with no path configured', () => {
      expect(() =>
        createRawArchive(HARNESS, settingsFor(false, null)),
      ).not.toThrow();
    });

    it('stores nothing at all', async () => {
      const { archiveRoot, logSource } = await createArchiveFixture();
      const sessionPath = join(logSource, 'session.jsonl');
      await writeFile(sessionPath, 'first\n');
      const archive = createRawArchive(
        HARNESS,
        settingsFor(false, archiveRoot),
      );

      await archive.store(await readStableSourceFile(sessionPath));

      await expect(stat(archiveRoot)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });
  });

  describe('an archive enabled with no usable path', () => {
    it.each([null, '', '   '])('refuses to be constructed', (configured) => {
      expect(() =>
        createRawArchive(HARNESS, settingsFor(true, configured)),
      ).toThrowError(
        'Raw archive is enabled but no archive path is configured',
      );
    });
  });

  describe('an archive enabled with a path', () => {
    const stamp = new Date('2025-03-04T05:06:07.000Z');
    let root: string;
    let archiveRoot: string;
    let logSource: string;
    let sessionPath: string;
    let destination: string;
    let archive: RawArchive;

    beforeEach(async () => {
      ({ root, archiveRoot, logSource } = await createArchiveFixture());
      sessionPath = join(logSource, 'session.jsonl');
      await writeFile(sessionPath, 'first\n');
      await utimes(sessionPath, stamp, stamp);
      destination = rawArchiveDestination(archiveRoot, HARNESS, sessionPath);
      archive = createRawArchive(HARNESS, settingsFor(true, archiveRoot));
    });

    it('acquires nothing until it is asked to store something', async () => {
      await expect(stat(archiveRoot)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    it('copies the source contents verbatim', async () => {
      await archive.store(await readStableSourceFile(sessionPath));

      await expect(readFile(destination)).resolves.toEqual(
        Buffer.from('first\n'),
      );
    });

    it('carries the source modification time onto the copy', async () => {
      await archive.store(await readStableSourceFile(sessionPath));

      expect((await stat(destination)).mtime).toEqual(stamp);
    });

    it('carries the source access time onto the copy', async () => {
      const read = await readStableSourceFile(sessionPath);
      await archive.store(read);

      // Stat before anything reads the copy: its preserved atime predates its
      // own ctime, so the first read of it is exactly the case relatime
      // updates atime for.
      expect((await stat(destination)).atime).toEqual(read.atime);
    });

    it('stores identically named files from two Log sources side by side', async () => {
      const secondSource = join(root, 'second-source');
      await mkdir(secondSource, { recursive: true });
      const secondPath = join(secondSource, 'session.jsonl');
      await writeFile(secondPath, 'second\n');

      await archive.store(await readStableSourceFile(sessionPath));
      await archive.store(await readStableSourceFile(secondPath));

      await expect(readFile(destination)).resolves.toEqual(
        Buffer.from('first\n'),
      );
      await expect(
        readFile(rawArchiveDestination(archiveRoot, HARNESS, secondPath)),
      ).resolves.toEqual(Buffer.from('second\n'));
    });

    describe('that already holds a copy of the source', () => {
      const matching = new Date('2026-01-01T00:00:00.000Z');
      const laterThanMatching = new Date(matching.getTime() + 2_000);
      // Contents the archive did not write, so anything it writes over the top
      // of the copy shows up as a change in the bytes on disk.
      let sentinel: Buffer;

      beforeEach(async () => {
        await archive.store(await readStableSourceFile(sessionPath));
        sentinel = Buffer.alloc((await stat(sessionPath)).size, 122);
        await writeFile(destination, sentinel);
        await utimes(sessionPath, matching, matching);
        await utimes(destination, matching, matching);
      });

      it('leaves the copy alone while the source still matches it', async () => {
        await archive.store(await readStableSourceFile(sessionPath));

        await expect(readFile(destination)).resolves.toEqual(sentinel);
      });

      it('replaces the copy once the source has grown', async () => {
        await appendFile(sessionPath, 'second\n');
        await utimes(sessionPath, laterThanMatching, laterThanMatching);

        await archive.store(await readStableSourceFile(sessionPath));

        await expect(readFile(destination)).resolves.toEqual(
          await readFile(sessionPath),
        );
      });

      it('replaces the copy once the source has been rewritten at the same size', async () => {
        await writeFile(sessionPath, 'FIRST\n');
        await utimes(sessionPath, laterThanMatching, laterThanMatching);

        await archive.store(await readStableSourceFile(sessionPath));

        await expect(readFile(destination)).resolves.toEqual(
          Buffer.from('FIRST\n'),
        );
      });
    });

    describe('whose destination cannot be written', () => {
      // Occupying the destination with a directory makes the archive's final
      // move onto it fail for real, rather than through an injected fault.
      let failure: unknown;

      beforeEach(async () => {
        await mkdir(destination, { recursive: true });
        failure = await archive
          .store(await readStableSourceFile(sessionPath))
          .then(
            () => undefined,
            (cause: unknown) => cause,
          );
      });

      it('reports a Raw archive failure naming the source file', () => {
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toBe(
          `Raw archive could not store ${sessionPath}`,
        );
      });

      it('keeps the underlying filesystem error as the cause', () => {
        const cause = (failure as Error).cause;

        expect(cause).toBeInstanceOf(Error);
        expect((cause as Error).message).toContain(destination);
      });

      it('leaves no temporary file behind', async () => {
        expect(failure).toBeInstanceOf(Error);

        const entries = await readdir(dirname(destination));
        expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
      });
    });
  });
});

describe('rawArchiveDestination', () => {
  const archiveRoot = resolve('/archive');

  it('places a source beneath the Harness directory', () => {
    const destination = rawArchiveDestination(
      archiveRoot,
      HARNESS,
      resolve('/logs/session.jsonl'),
    );

    const withinHarness = relative(join(archiveRoot, HARNESS), destination);
    expect(withinHarness.startsWith('..')).toBe(false);
  });

  it('mirrors the source path beneath the encoded filesystem root', () => {
    const sourcePath = resolve('/logs/nested/session.jsonl');

    const destination = rawArchiveDestination(archiveRoot, HARNESS, sourcePath);

    const withinHarness = relative(join(archiveRoot, HARNESS), destination);
    expect(
      withinHarness.endsWith(relative(parse(sourcePath).root, sourcePath)),
    ).toBe(true);
  });

  it('keeps identically named files from two Log sources apart', () => {
    expect(
      rawArchiveDestination(archiveRoot, HARNESS, resolve('/first/log.jsonl')),
    ).not.toBe(
      rawArchiveDestination(archiveRoot, HARNESS, resolve('/second/log.jsonl')),
    );
  });
});

async function createArchiveFixture() {
  const root = await mkdtemp(join(tmpdir(), 'llm-retro-raw-archive-'));
  temporaryDirectories.push(root);
  const logSource = join(root, 'sessions');
  await mkdir(logSource, { recursive: true });
  return { root, archiveRoot: join(root, 'archive'), logSource };
}

function settingsFor(
  rawArchiveEnabled: boolean,
  rawArchivePath: string | null,
): ApplicationSettings {
  return {
    timezone: 'Asia/Kolkata',
    rawArchiveEnabled,
    rawArchivePath,
    logSources: { claude: [], codex: [], pi: [], omp: [] },
    logSourceOverrides: {},
  };
}
