import type * as FsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupPipelineFixtures,
  createFakeAdapter,
  createPipelineFixture,
  runPipeline,
  writeLines,
} from './ingest-pipeline-fixture';

// The pipeline re-stats a file around its read to reject a snapshot that
// mutated mid-read (ADR-0008). That race cannot be provoked deterministically
// with a real filesystem, so the read handle's second `stat` is forced to
// disagree with the first — the faithful simulation of a concurrent writer.
const unstablePaths = new Set<string>();

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    async open(path: string, ...rest: unknown[]) {
      const handle = await (
        actual.open as (path: string, ...rest: unknown[]) => Promise<unknown>
      )(path, ...rest);
      if (!unstablePaths.has(path)) return handle;
      const fileHandle = handle as { stat: () => Promise<{ size: number }> };
      let stats = 0;
      return new Proxy(fileHandle, {
        get(target, property, receiver) {
          if (property === 'stat') {
            return async () => {
              const real = await target.stat();
              stats += 1;
              return stats >= 2 ? { ...real, size: real.size + 1 } : real;
            };
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

afterEach(() => {
  unstablePaths.clear();
  return cleanupPipelineFixtures();
});

describe('Ingest pipeline mid-read stability', () => {
  it('rejects a source file that changes between the before and after stat', async () => {
    const fixture = await createPipelineFixture();
    const sessionPath = join(fixture.logSource, 'mutating.log');
    await writeLines(sessionPath, [
      { key: 'm-1', cwd: '/repo/one', timestamp: Date.now() },
    ]);
    unstablePaths.add(sessionPath);

    try {
      await expect(
        runPipeline(createFakeAdapter(), fixture.database),
      ).rejects.toThrow(`File changed while it was being read: ${sessionPath}`);
    } finally {
      fixture.sqlite.close();
    }
  });
});
