import { and, eq } from 'drizzle-orm';
import { open } from 'node:fs/promises';
import { checkpoints } from '../database/schema';
import type { Job, JobContext, JobHandler } from './types';

type StubJobPayload = {
  harness: string;
  stableSessionId: string;
  filePath: string;
  recordDelayMs?: number;
};

export function createStubJob(payload: StubJobPayload): Job<StubJobPayload> {
  return {
    identity: {
      type: 'stub',
      scope: `${payload.harness}:${payload.stableSessionId}`,
    },
    payload,
  };
}

async function readStableFile(filePath: string) {
  const fileHandle = await open(filePath, 'r');
  try {
    const before = await fileHandle.stat();
    const contents = await fileHandle.readFile();
    const after = await fileHandle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`File changed while it was being read: ${filePath}`);
    }
    return {
      contents,
      fileSize: after.size,
      fileMtime: Math.trunc(after.mtimeMs),
    };
  } finally {
    await fileHandle.close();
  }
}

async function runStubJob(
  payload: StubJobPayload,
  context: JobContext,
): Promise<void> {
  const { contents, fileSize, fileMtime } = await readStableFile(
    payload.filePath,
  );
  const stored = context.database
    .select()
    .from(checkpoints)
    .where(
      and(
        eq(checkpoints.harness, payload.harness),
        eq(checkpoints.stableSessionId, payload.stableSessionId),
      ),
    )
    .get();
  const lastNewline = contents.lastIndexOf(10);
  const lastCompleteOffset = lastNewline === -1 ? 0 : lastNewline + 1;
  const metadataMatches =
    stored?.fileSize === fileSize && stored.fileMtime === fileMtime;

  context.progress({
    filesTotal: 1,
    filesDone: 0,
    currentFile: payload.filePath,
  });

  if (
    metadataMatches &&
    stored.lastCompleteRecordByteOffset >= lastCompleteOffset
  ) {
    context.progress({ filesTotal: 1, filesDone: 1 });
    return;
  }

  let lastCompleteRecordByteOffset =
    stored && metadataMatches
      ? Math.min(stored.lastCompleteRecordByteOffset, fileSize)
      : 0;
  const saveCheckpoint = (byteOffset: number) => {
    context.database
      .insert(checkpoints)
      .values({
        harness: payload.harness,
        stableSessionId: payload.stableSessionId,
        lastCompleteRecordByteOffset: byteOffset,
        fileSize,
        fileMtime,
      })
      .onConflictDoUpdate({
        target: [checkpoints.harness, checkpoints.stableSessionId],
        set: {
          lastCompleteRecordByteOffset: byteOffset,
          fileSize,
          fileMtime,
        },
      })
      .run();
  };

  let recordEnd = contents.indexOf(10, lastCompleteRecordByteOffset);
  while (recordEnd !== -1) {
    lastCompleteRecordByteOffset = recordEnd + 1;
    saveCheckpoint(lastCompleteRecordByteOffset);
    context.log(
      `Processed ${payload.filePath} through byte ${lastCompleteRecordByteOffset}`,
    );
    if (payload.recordDelayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, payload.recordDelayMs),
      );
    }
    recordEnd = contents.indexOf(10, lastCompleteRecordByteOffset);
  }

  saveCheckpoint(lastCompleteRecordByteOffset);
  context.progress({ filesTotal: 1, filesDone: 1 });
}

export const stubJobHandler: JobHandler<StubJobPayload> = { run: runStubJob };
