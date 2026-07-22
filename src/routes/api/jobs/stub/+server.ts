import { bootstrap } from '$lib/server/bootstrap';
import { createStubJob } from '$lib/server/jobs/stub-job';
import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RequestHandler } from './$types';

const fixturePath = join(dirname(bootstrap.databasePath), 'stub-job.jsonl');
const fixture = Array.from({ length: 12 }, (_, index) =>
  JSON.stringify({ record: index + 1 }),
).join('\n');

async function ensureFixture(): Promise<void> {
  try {
    await writeFile(fixturePath, `${fixture}\n`, { flag: 'wx' });
  } catch (cause) {
    if (
      !(cause instanceof Error) ||
      !('code' in cause) ||
      cause.code !== 'EEXIST'
    ) {
      throw cause;
    }
  }
}

export const POST: RequestHandler = async ({ request }) => {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    error(400, 'Expected a JSON object');
  }

  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).length !== 0
  ) {
    error(400, 'The stub Job accepts an empty JSON object');
  }

  await ensureFixture();
  const correlationId = bootstrap.dispatcher.dispatch(
    createStubJob({
      harness: 'stub',
      stableSessionId: `browser-demo:${randomUUID()}`,
      filePath: fixturePath,
      recordDelayMs: 120,
    }),
  );

  return json({ correlation_id: correlationId }, { status: 202 });
};
