import { open } from 'node:fs/promises';

/**
 * One source file as a single Ingestion run read it. The pipeline checkpoints
 * and parses against `fileSize`, `fileMtime` and `contents`; the Raw archive
 * additionally reproduces `atime` and `mtime` on the copy it writes.
 */
export interface SourceFileRead {
  filePath: string;
  contents: Buffer;
  fileSize: number;
  fileMtime: number;
  atime: Date;
  mtime: Date;
}

/**
 * Reads a source file and proves it did not change underneath the read: the
 * open handle is stat-ed either side, and a size or modification time that
 * moved rejects the read rather than returning bytes that no longer match the
 * metadata describing them (ADR-0008). Every consumer of the result — the
 * Checkpoint comparison, the slice parse, the archive copy — therefore reasons
 * about one coherent moment of the file.
 */
export async function readStableSourceFile(
  filePath: string,
): Promise<SourceFileRead> {
  const fileHandle = await open(filePath, 'r');
  try {
    const before = await fileHandle.stat();
    const contents = await fileHandle.readFile();
    const after = await fileHandle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`File changed while it was being read: ${filePath}`);
    }
    return {
      filePath,
      contents,
      fileSize: after.size,
      fileMtime: Math.trunc(after.mtimeMs),
      atime: after.atime,
      mtime: after.mtime,
    };
  } finally {
    await fileHandle.close();
  }
}
