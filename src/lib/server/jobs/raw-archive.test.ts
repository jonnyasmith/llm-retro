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
import { afterEach, describe, expect, it } from 'vitest';
import type { Harness } from '../../jobs/contracts';
import type { ApplicationSettings } from '../../settings/contracts';
import { createRawArchive, rawArchiveDestination } from './raw-archive';
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
  it('mirrors the source beneath the Harness directory, carrying its timestamps', async () => {
    const { archiveRoot, logSource } = await createArchiveFixture();
    const sessionPath = join(logSource, 'session.jsonl');
    await writeFile(sessionPath, 'first\n');
    const stamp = new Date('2025-03-04T05:06:07.000Z');
    await utimes(sessionPath, stamp, stamp);
    const archive = createRawArchive(HARNESS, settingsFor(true, archiveRoot));

    const read = await readStableSourceFile(sessionPath);
    await archive.store(read);

    const destination = rawArchiveDestination(
      archiveRoot,
      HARNESS,
      sessionPath,
    );
    await expect(readFile(destination)).resolves.toEqual(
      Buffer.from('first\n'),
    );
    const withinHarness = relative(join(archiveRoot, HARNESS), destination);
    expect(withinHarness.startsWith('..')).toBe(false);
    const absoluteSource = resolve(sessionPath);
    expect(
      withinHarness.endsWith(
        relative(parse(absoluteSource).root, absoluteSource),
      ),
    ).toBe(true);
    const archived = await stat(destination);
    expect(archived.mtime).toEqual(stamp);
    expect(archived.atime).toEqual(read.atime);
  });

  it('skips a copy that still matches and replaces one whose source has grown', async () => {
    const { archiveRoot, logSource } = await createArchiveFixture();
    const sessionPath = join(logSource, 'session.jsonl');
    await writeFile(sessionPath, 'first\n');
    const archive = createRawArchive(HARNESS, settingsFor(true, archiveRoot));
    const destination = rawArchiveDestination(
      archiveRoot,
      HARNESS,
      sessionPath,
    );

    await archive.store(await readStableSourceFile(sessionPath));
    const sentinel = Buffer.alloc((await stat(sessionPath)).size, 122);
    await writeFile(destination, sentinel);
    const matching = new Date('2026-01-01T00:00:00.000Z');
    await utimes(sessionPath, matching, matching);
    await utimes(destination, matching, matching);

    await archive.store(await readStableSourceFile(sessionPath));
    await expect(readFile(destination)).resolves.toEqual(sentinel);

    await appendFile(sessionPath, 'second\n');
    const changed = new Date(matching.getTime() + 2_000);
    await utimes(sessionPath, changed, changed);
    await archive.store(await readStableSourceFile(sessionPath));
    await expect(readFile(destination)).resolves.toEqual(
      await readFile(sessionPath),
    );
  });

  it('keeps identically named files from two Log sources apart', async () => {
    const { root, archiveRoot, logSource } = await createArchiveFixture();
    const secondSource = join(root, 'second-source');
    await mkdir(secondSource, { recursive: true });
    const firstPath = join(logSource, 'shared.jsonl');
    const secondPath = join(secondSource, 'shared.jsonl');
    await writeFile(firstPath, 'first\n');
    await writeFile(secondPath, 'second\n');
    const archive = createRawArchive(HARNESS, settingsFor(true, archiveRoot));

    expect(rawArchiveDestination(archiveRoot, HARNESS, firstPath)).not.toBe(
      rawArchiveDestination(archiveRoot, HARNESS, secondPath),
    );

    await archive.store(await readStableSourceFile(firstPath));
    await archive.store(await readStableSourceFile(secondPath));
    await expect(
      readFile(rawArchiveDestination(archiveRoot, HARNESS, firstPath)),
    ).resolves.toEqual(Buffer.from('first\n'));
    await expect(
      readFile(rawArchiveDestination(archiveRoot, HARNESS, secondPath)),
    ).resolves.toEqual(Buffer.from('second\n'));
  });

  it('refuses to be constructed when it is enabled with no path', async () => {
    expect(() =>
      createRawArchive(HARNESS, settingsFor(true, null)),
    ).toThrowError('Raw archive is enabled but no archive path is configured');
    expect(() =>
      createRawArchive(HARNESS, settingsFor(true, '   ')),
    ).toThrowError('Raw archive is enabled but no archive path is configured');
  });

  it('stores nothing at all when it is switched off', async () => {
    const { archiveRoot, logSource } = await createArchiveFixture();
    const sessionPath = join(logSource, 'session.jsonl');
    await writeFile(sessionPath, 'first\n');
    const archive = createRawArchive(HARNESS, settingsFor(false, archiveRoot));

    await archive.store(await readStableSourceFile(sessionPath));

    await expect(stat(archiveRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports a write it cannot complete as a Raw archive failure, keeping the cause', async () => {
    const { archiveRoot, logSource } = await createArchiveFixture();
    const { archive, sessionPath, destination } =
      await createUnwritableDestination(archiveRoot, logSource);

    const read = await readStableSourceFile(sessionPath);
    const failure = await archive.store(read).catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      `Raw archive could not store ${sessionPath}`,
    );
    const cause = (failure as Error).cause;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toContain(destination);
  });

  it('leaves no temporary file behind when a write cannot be completed', async () => {
    const { archiveRoot, logSource } = await createArchiveFixture();
    const { archive, sessionPath, destination } =
      await createUnwritableDestination(archiveRoot, logSource);

    await expect(
      archive.store(await readStableSourceFile(sessionPath)),
    ).rejects.toThrow();

    const entries = await readdir(dirname(destination));
    expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });
});

async function createArchiveFixture() {
  const root = await mkdtemp(join(tmpdir(), 'llm-retro-raw-archive-'));
  temporaryDirectories.push(root);
  const logSource = join(root, 'sessions');
  await mkdir(logSource, { recursive: true });
  return { root, archiveRoot: join(root, 'archive'), logSource };
}

/**
 * A source file whose destination is occupied by a directory, so the archive's
 * final move onto it cannot succeed — a real failure rather than an injected
 * one. The source's timestamps are pinned into the past so the already-archived
 * check cannot mistake the directory for a current copy.
 */
async function createUnwritableDestination(
  archiveRoot: string,
  logSource: string,
) {
  const sessionPath = join(logSource, 'session.jsonl');
  await writeFile(sessionPath, 'first\n');
  const stamp = new Date('2025-03-04T05:06:07.000Z');
  await utimes(sessionPath, stamp, stamp);
  const destination = rawArchiveDestination(archiveRoot, HARNESS, sessionPath);
  await mkdir(destination, { recursive: true });
  return {
    archive: createRawArchive(HARNESS, settingsFor(true, archiveRoot)),
    sessionPath,
    destination,
  };
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
