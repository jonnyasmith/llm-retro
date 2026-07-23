import {
  mkdir,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../database/connection';
import { interactions } from '../database/schema';
import { updateSettings } from '../database/store';
import {
  createClaudeIngestHandler,
  literalCwdProjectResolver,
} from './claude-ingest';
import {
  cleanupClaudeIngestFixtures,
  createClaudeIngestFixture as createFixture,
  writeJsonLines,
} from './claude-ingest-fixture';

afterEach(cleanupClaudeIngestFixtures);

describe('Claude ingest raw archive', () => {
  it('archives primary and subagent bytes before parsing in a mirrored layout', async () => {
    const fixture = await createFixture();
    const archiveRoot = join(dirname(fixture.logSource), 'raw-archive');
    const sessionPath = join(fixture.projectDirectory, 'invalid.jsonl');
    const subagentPath = join(
      fixture.projectDirectory,
      'invalid',
      'subagents',
      'agent-one.jsonl',
    );
    await mkdir(dirname(subagentPath), { recursive: true });
    await writeFile(sessionPath, '{invalid primary}\n');
    await writeFile(subagentPath, '{invalid subagent}\n');
    updateSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
    });

    await expect(runIngest(fixture.database)).rejects.toThrow(
      `Invalid Claude JSONL at ${sessionPath}:1`,
    );
    await expect(
      readFile(archivePath(archiveRoot, sessionPath)),
    ).resolves.toEqual(Buffer.from('{invalid primary}\n'));
    await expect(
      readFile(archivePath(archiveRoot, subagentPath)),
    ).resolves.toEqual(Buffer.from('{invalid subagent}\n'));
  });

  it('does not archive when disabled and stores identical interactions', async () => {
    const enabled = await createFixture();
    const disabled = await createFixture();
    const archiveRoot = join(dirname(enabled.logSource), 'raw-archive');
    const enabledPaths = await writeSessionWithSubagent(
      enabled.projectDirectory,
    );
    const disabledPaths = await writeSessionWithSubagent(
      disabled.projectDirectory,
    );
    updateSettings(enabled.database, {
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
    });
    updateSettings(disabled.database, {
      rawArchiveEnabled: false,
      rawArchivePath: join(dirname(disabled.logSource), 'raw-archive'),
    });

    await runIngest(enabled.database);
    await runIngest(disabled.database);

    await expect(
      readFile(archivePath(archiveRoot, enabledPaths.sessionPath)),
    ).resolves.toEqual(await readFile(enabledPaths.sessionPath));
    await expect(
      readFile(archivePath(archiveRoot, enabledPaths.subagentPath)),
    ).resolves.toEqual(await readFile(enabledPaths.subagentPath));
    await expect(
      readFile(
        archivePath(
          join(dirname(disabled.logSource), 'raw-archive'),
          disabledPaths.sessionPath,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(interactionEvidence(enabled.database)).toEqual(
      interactionEvidence(disabled.database),
    );
  });

  it('skips matching metadata and fully replaces a changed archived file', async () => {
    const fixture = await createFixture();
    const archiveRoot = join(dirname(fixture.logSource), 'raw-archive');
    const { sessionPath, subagentPath } = await writeSessionWithSubagent(
      fixture.projectDirectory,
    );
    updateSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
    });
    await runIngest(fixture.database);

    const archivedSession = archivePath(archiveRoot, sessionPath);
    const archivedSubagent = archivePath(archiveRoot, subagentPath);
    const sessionSourceStat = await stat(sessionPath);
    const subagentSourceStat = await stat(subagentPath);
    const sessionSentinel = Buffer.alloc(sessionSourceStat.size, 120);
    const subagentSentinel = Buffer.alloc(subagentSourceStat.size, 121);
    await writeFile(archivedSession, sessionSentinel);
    await writeFile(archivedSubagent, subagentSentinel);
    const matchingTime = new Date('2026-01-01T00:00:00.000Z');
    await utimes(sessionPath, matchingTime, matchingTime);
    await utimes(subagentPath, matchingTime, matchingTime);
    await utimes(archivedSession, matchingTime, matchingTime);
    await utimes(archivedSubagent, matchingTime, matchingTime);

    await runIngest(fixture.database);
    await expect(readFile(archivedSession)).resolves.toEqual(sessionSentinel);
    await expect(readFile(archivedSubagent)).resolves.toEqual(subagentSentinel);

    await writeFile(subagentPath, '{}\n');
    const changedTime = new Date(matchingTime.getTime() + 2_000);
    await utimes(subagentPath, changedTime, changedTime);
    await expect(
      runIngest(fixture.database, async () => {
        throw new Error('Injected archive rename failure');
      }),
    ).rejects.toThrow('Injected archive rename failure');
    await expect(readFile(archivedSubagent)).resolves.toEqual(subagentSentinel);
    expect(
      (await readdir(dirname(archivedSubagent))).filter((entry) =>
        entry.endsWith('.tmp'),
      ),
    ).toEqual([]);

    await runIngest(fixture.database);

    await expect(readFile(archivedSubagent)).resolves.toEqual(
      Buffer.from('{}\n'),
    );
    await expect(readFile(archivedSession)).resolves.toEqual(sessionSentinel);
  });

  it('keeps identical relative paths from separate sources collision-free', async () => {
    const fixture = await createFixture();
    const archiveRoot = join(dirname(fixture.logSource), 'raw-archive');
    const secondSource = join(dirname(fixture.logSource), 'second-source');
    const secondProject = join(secondSource, '-work-alpha');
    await mkdir(secondProject, { recursive: true });
    const firstPath = join(fixture.projectDirectory, 'shared.jsonl');
    const secondPath = join(secondProject, 'shared.jsonl');
    await writeJsonLines(firstPath, validSessionRecords('prompt-first'));
    await writeJsonLines(secondPath, validSessionRecords('prompt-other'));
    const sharedMtime = new Date('2026-01-01T00:00:00.000Z');
    await utimes(firstPath, sharedMtime, sharedMtime);
    await utimes(secondPath, sharedMtime, sharedMtime);
    updateSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
      logSourceOverrides: { claude: [fixture.logSource, secondSource] },
    });

    await runIngest(fixture.database);

    expect(archivePath(archiveRoot, firstPath)).not.toBe(
      archivePath(archiveRoot, secondPath),
    );
    await expect(
      readFile(archivePath(archiveRoot, firstPath)),
    ).resolves.toEqual(await readFile(firstPath));
    await expect(
      readFile(archivePath(archiveRoot, secondPath)),
    ).resolves.toEqual(await readFile(secondPath));
  });

  it('rejects an enabled archive without a configured path', async () => {
    const fixture = await createFixture();
    updateSettings(fixture.database, {
      rawArchiveEnabled: true,
      rawArchivePath: null,
    });

    await expect(runIngest(fixture.database)).rejects.toThrow(
      'Raw archive is enabled but no archive path is configured',
    );
  });
});

async function writeSessionWithSubagent(projectDirectory: string) {
  const sessionPath = join(projectDirectory, 'shared.jsonl');
  const subagentPath = join(
    projectDirectory,
    'shared',
    'subagents',
    'agent-one.jsonl',
  );
  await mkdir(dirname(subagentPath), { recursive: true });
  await writeJsonLines(sessionPath, validSessionRecords('prompt-1'));
  await writeJsonLines(subagentPath, [
    {
      type: 'assistant',
      uuid: 'subagent-assistant',
      agentId: 'agent-one',
      isSidechain: true,
      message: { model: 'claude-haiku-4-5', usage: { output_tokens: 3 } },
    },
  ]);
  return { sessionPath, subagentPath };
}

function validSessionRecords(openingUserRecordId: string) {
  return [
    {
      type: 'user',
      uuid: openingUserRecordId,
      cwd: '/work/alpha',
      timestamp: '2025-01-01T20:00:00.000Z',
      message: { content: 'Build it' },
    },
    {
      type: 'assistant',
      uuid: `${openingUserRecordId}-answer`,
      timestamp: '2025-01-01T20:00:01.000Z',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 2, output_tokens: 4 },
      },
    },
  ];
}

function archivePath(archiveRoot: string, sourcePath: string): string {
  const absoluteSource = resolve(sourcePath);
  const filesystemRoot = parse(absoluteSource).root;
  return join(
    archiveRoot,
    'claude',
    Buffer.from(filesystemRoot).toString('base64url'),
    relative(filesystemRoot, absoluteSource),
  );
}

function interactionEvidence(database: Database) {
  return database
    .select({
      openingUserRecordId: interactions.openingUserRecordId,
      model: interactions.model,
      mainInputTokens: interactions.mainInputTokens,
      mainOutputTokens: interactions.mainOutputTokens,
      subOutputTokens: interactions.subOutputTokens,
      timestamp: interactions.timestamp,
    })
    .from(interactions)
    .all();
}

async function runIngest(
  database: Database,
  renameArchivedFile?: (oldPath: string, newPath: string) => Promise<void>,
) {
  const handler = createClaudeIngestHandler({
    resolveProject: literalCwdProjectResolver,
    renameArchivedFile,
  });
  await handler.run(null, {
    correlationId: 'archive-test',
    database,
    progress: vi.fn(),
    log: vi.fn(),
  });
}
