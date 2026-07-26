import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  rename,
  rm,
  stat,
  type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
import type { Harness } from '../../jobs/contracts';
import type { ApplicationSettings } from '../../settings/contracts';
import { isMissingPath } from './missing-path';
import type { SourceFileRead } from './source-file-read';

/**
 * The Raw archive of one Harness, for the duration of one Ingestion run: the
 * protected copy of the untouched source files ADR-0003 keeps against a Harness
 * pruning or rotating its own logs.
 *
 * A copy is taken before any Harness-specific code reads the file, so a
 * malformed file is archived rather than lost, and a copy that fails fails the
 * run — a hedge the user does not actually hold is worse than none.
 */
export interface RawArchive {
  /**
   * Copies one source file into the archive, unless a copy of that exact size
   * and modification time is already there. The copy carries the source's
   * access and modification times, appears whole or not at all, and is on disk
   * rather than in a cache before the call resolves.
   *
   * Any failure is reported as a Raw archive failure naming the source file,
   * with the underlying filesystem error kept as `cause`.
   */
  store(source: SourceFileRead): Promise<void>;
}

/** A switched-off archive is a real archive that stores nothing. */
const disabledArchive: RawArchive = {
  async store() {},
};

/**
 * The archive for a run's Settings snapshot (ADR-0011). Nothing is acquired and
 * no filesystem is touched: creating the archive root is a Settings-save
 * concern, and creating a destination's parent directory belongs to the copy
 * itself, which is what lets the archive survive a root deleted after saving.
 *
 * An archive enabled without a path cannot be constructed, so a run configured
 * to archive can never proceed silently not archiving — Settings rows written
 * directly, bypassing the validated save, reach here too.
 */
export function createRawArchive(
  harness: Harness,
  settings: ApplicationSettings,
): RawArchive {
  if (!settings.rawArchiveEnabled) return disabledArchive;

  const configuredPath = settings.rawArchivePath;
  if (configuredPath === null || configuredPath.trim().length === 0) {
    throw new Error('Raw archive is enabled but no archive path is configured');
  }
  const archiveRoot = resolve(configuredPath);

  return {
    async store(source) {
      try {
        await storeSourceFile(archiveRoot, harness, source);
      } catch (cause) {
        throw new Error(`Raw archive could not store ${source.filePath}`, {
          cause,
        });
      }
    },
  };
}

/**
 * Where a source file lands in the archive. Published because the layout is a
 * contract, not an implementation detail: "reset checkpoints, re-ingest" is
 * only recoverable if a human can find the file a Session came from, and the
 * encoded filesystem-root segment is the only thing keeping identically named
 * files from two Log sources apart (ADR-0003).
 */
export function rawArchiveDestination(
  archiveRoot: string,
  harness: Harness,
  sourcePath: string,
): string {
  const absoluteSource = resolve(sourcePath);
  const filesystemRoot = parse(absoluteSource).root;
  return join(
    archiveRoot,
    harness,
    Buffer.from(filesystemRoot).toString('base64url'),
    relative(filesystemRoot, absoluteSource),
  );
}

async function storeSourceFile(
  archiveRoot: string,
  harness: Harness,
  source: SourceFileRead,
): Promise<void> {
  const destination = rawArchiveDestination(
    archiveRoot,
    harness,
    source.filePath,
  );
  try {
    const archived = await stat(destination);
    if (
      archived.size === source.fileSize &&
      Math.abs(archived.mtimeMs - source.fileMtime) < 1
    ) {
      return;
    }
  } catch (cause) {
    if (!isMissingPath(cause)) throw cause;
  }

  await mkdir(dirname(destination), { recursive: true });
  const temporaryPath = join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.tmp`,
  );
  let temporaryHandle: FileHandle | undefined;
  try {
    temporaryHandle = await open(temporaryPath, 'wx');
    await temporaryHandle.writeFile(source.contents);
    await temporaryHandle.utimes(source.atime, source.mtime);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await rename(temporaryPath, destination);
  } finally {
    try {
      await temporaryHandle?.close();
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}
