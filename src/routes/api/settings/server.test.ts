import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/database/connection';
import { openDatabase } from '$lib/server/database/connection';
import {
  resolveDefaultLogSources,
  persistSettings,
} from '$lib/server/database/store';
import {
  interactions,
  jobRuns,
  projects,
  sessions,
  settings,
} from '$lib/server/database/schema';

const state = vi.hoisted(() => ({
  database: undefined as unknown as Database,
}));

vi.mock('$lib/server/bootstrap', () => ({
  bootstrap: {
    get database() {
      return state.database;
    },
  },
}));

import { POST } from './+server';

const temporaryDirectories: string[] = [];
let connection: ReturnType<typeof openDatabase>;

function request(body: unknown): Request {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function malformedRequest(body: string): Request {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

beforeEach(async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-settings-'));
  temporaryDirectories.push(dataDirectory);
  connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  state.database = connection.database;
});

afterEach(async () => {
  connection.sqlite.close();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('settings endpoint', () => {
  it('applies a partial update and returns the full resolved settings', async () => {
    persistSettings(connection.database, {
      timezone: 'Europe/London',
      rawArchivePath: '/existing/archive',
    });

    const response = await POST({
      request: request({ rawArchiveEnabled: false }),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      timezone: 'Europe/London',
      rawArchiveEnabled: false,
      rawArchivePath: '/existing/archive',
      logSources: expect.objectContaining({
        claude: expect.any(Array),
        codex: expect.any(Array),
        pi: expect.any(Array),
        omp: expect.any(Array),
      }),
      logSourceOverrides: {},
    });
  });

  it('rejects invalid changes without modifying stored settings', async () => {
    persistSettings(connection.database, {
      timezone: 'Europe/London',
      rawArchiveEnabled: false,
      rawArchivePath: '/existing/archive',
      logSourceOverrides: { codex: ['/existing/codex'] },
    });
    const before = connection.database.select().from(settings).get();
    const invalidRequests = [
      malformedRequest('{'),
      request({ unknown: true }),
      request({ timezone: 42 }),
      request({ timezone: 'Not/A-Timezone' }),
      request({ rawArchiveEnabled: 'yes' }),
      request({ rawArchiveEnabled: true, rawArchivePath: '   ' }),
      request({ rawArchivePath: 'relative/archive' }),
      request({ logSourceOverrides: { codex: [] } }),
      request({ logSourceOverrides: { codex: ['relative/logs'] } }),
      request({ logSourceOverrides: { unknown: ['/logs'] } }),
    ];

    for (const invalidRequest of invalidRequests) {
      const response = await POST({
        request: invalidRequest,
      } as Parameters<typeof POST>[0]);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: expect.any(String) });
      expect(connection.database.select().from(settings).get()).toEqual(before);
    }
  });

  it('creates an enabled archive directory and allows its path to be cleared while disabled', async () => {
    const archiveRoot = join(
      temporaryDirectories[temporaryDirectories.length - 1],
      'nested',
      'archive',
    );

    const enabled = await POST({
      request: request({
        rawArchiveEnabled: true,
        rawArchivePath: archiveRoot,
      }),
    } as Parameters<typeof POST>[0]);

    expect(enabled.status).toBe(200);
    expect(await enabled.json()).toMatchObject({
      rawArchiveEnabled: true,
      rawArchivePath: archiveRoot,
    });
    expect((await stat(archiveRoot)).isDirectory()).toBe(true);

    const cleared = await POST({
      request: request({
        rawArchiveEnabled: false,
        rawArchivePath: null,
      }),
    } as Parameters<typeof POST>[0]);

    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({
      rawArchiveEnabled: false,
      rawArchivePath: null,
    });
  });

  it('pins multiple Log source roots and resets a Harness to built-in defaults', async () => {
    const pinned = await POST({
      request: request({
        logSourceOverrides: {
          codex: ['/external/codex/live', '/external/codex/archive'],
        },
      }),
    } as Parameters<typeof POST>[0]);

    expect(pinned.status).toBe(200);
    expect(await pinned.json()).toMatchObject({
      logSources: {
        codex: ['/external/codex/live', '/external/codex/archive'],
      },
      logSourceOverrides: {
        codex: ['/external/codex/live', '/external/codex/archive'],
      },
    });

    const reset = await POST({
      request: request({ logSourceOverrides: { codex: null } }),
    } as Parameters<typeof POST>[0]);

    expect(reset.status).toBe(200);
    expect(await reset.json()).toMatchObject({
      logSources: { codex: resolveDefaultLogSources().codex },
      logSourceOverrides: {},
    });
  });

  it('rebuilds existing Interaction local buckets when timezone changes', async () => {
    persistSettings(connection.database, { timezone: 'Europe/London' });
    const project = connection.database
      .insert(projects)
      .values({ rootPath: '/work/settings-test' })
      .returning()
      .get();
    const session = connection.database
      .insert(sessions)
      .values({
        harness: 'codex',
        stableSessionId: 'settings-test',
        projectId: project.id,
        logFilePath: '/logs/settings-test.jsonl',
      })
      .returning()
      .get();
    connection.database
      .insert(interactions)
      .values({
        sessionId: session.id,
        interactionKey: 'turn-1',
        harness: 'codex',
        projectId: project.id,
        model: 'gpt-5',
        modelRaw: 'gpt-5',
        timestamp: Date.parse('2025-01-15T12:00:00.000Z'),
        localDow: 3,
        localHour: 12,
        localDate: '2025-01-15',
      })
      .run();

    const response = await POST({
      request: request({ timezone: 'America/New_York' }),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      timezone: 'America/New_York',
    });
    expect(connection.database.select().from(interactions).get()).toMatchObject(
      {
        localDow: 3,
        localHour: 7,
        localDate: '2025-01-15',
      },
    );
  });

  it('refuses a timezone change during ingest while allowing other sections to save', async () => {
    persistSettings(connection.database, { timezone: 'Europe/London' });
    connection.database
      .insert(jobRuns)
      .values({
        type: 'ingest',
        scope: 'codex',
        correlationId: '11111111-1111-4111-8111-111111111111',
        status: 'running',
        startedAt: 1,
      })
      .run();

    const invalidTimezoneResponse = await POST({
      request: request({ timezone: 'Not/A-Timezone' }),
    } as Parameters<typeof POST>[0]);
    expect(invalidTimezoneResponse.status).toBe(400);

    const rejectedArchiveRoot = join(
      temporaryDirectories[temporaryDirectories.length - 1],
      'rejected-archive',
    );
    const combinedResponse = await POST({
      request: request({
        timezone: 'America/New_York',
        rawArchiveEnabled: true,
        rawArchivePath: rejectedArchiveRoot,
      }),
    } as Parameters<typeof POST>[0]);
    expect(combinedResponse.status).toBe(409);
    await expect(stat(rejectedArchiveRoot)).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const timezoneResponse = await POST({
      request: request({ timezone: 'America/New_York' }),
    } as Parameters<typeof POST>[0]);

    expect(timezoneResponse.status).toBe(409);
    expect(await timezoneResponse.json()).toEqual({
      error: expect.stringMatching(/ingest.*running.*retry/i),
    });
    expect(connection.database.select().from(settings).get()).toMatchObject({
      timezone: 'Europe/London',
    });

    const otherSectionsResponse = await POST({
      request: request({
        rawArchiveEnabled: false,
        rawArchivePath: '/next/archive',
        logSourceOverrides: { codex: ['/next/codex'] },
      }),
    } as Parameters<typeof POST>[0]);

    expect(otherSectionsResponse.status).toBe(200);
    expect(await otherSectionsResponse.json()).toMatchObject({
      rawArchivePath: '/next/archive',
      logSources: { codex: ['/next/codex'] },
    });
  });

  it('does not let legacy archive state block unrelated sections', async () => {
    persistSettings(connection.database, {
      timezone: 'Europe/London',
      rawArchiveEnabled: false,
    });
    connection.database
      .update(settings)
      .set({
        rawArchiveEnabled: true,
        rawArchivePath: 'legacy/relative/archive',
      })
      .run();

    const timeResponse = await POST({
      request: request({ timezone: 'America/New_York' }),
    } as Parameters<typeof POST>[0]);
    const logSourcesResponse = await POST({
      request: request({
        logSourceOverrides: { codex: ['/next/codex'] },
      }),
    } as Parameters<typeof POST>[0]);

    expect(timeResponse.status).toBe(200);
    expect(logSourcesResponse.status).toBe(200);
    expect(await logSourcesResponse.json()).toMatchObject({
      rawArchiveEnabled: true,
      rawArchivePath: 'legacy/relative/archive',
      logSources: { codex: ['/next/codex'] },
    });
  });
});
