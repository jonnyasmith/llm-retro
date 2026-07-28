import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection, Database } from '$lib/server/database/connection';
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
import type { ApplicationSettings } from '$lib/settings/contracts';

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

let dataDirectory: string;
let connection: Connection;

function request(change: unknown): Request {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(change),
  });
}

function malformedRequest(body: string): Request {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

/** The endpoint's only seam: a request event carrying nothing but the request. */
async function send(built: Request): Promise<Response> {
  return POST({ request: built } as Parameters<typeof POST>[0]);
}

/** The Settings row exactly as the Store holds it, absent until a first save. */
function storedSettings(): typeof settings.$inferSelect | undefined {
  return connection.database.select().from(settings).get();
}

beforeEach(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'llm-retro-settings-'));
  connection = openDatabase({ LLM_RETRO_DATA_DIR: dataDirectory });
  state.database = connection.database;
});

afterEach(async () => {
  connection.close();
  await rm(dataDirectory, { recursive: true, force: true });
});

describe('settings endpoint', () => {
  describe('Settings that have never been saved', () => {
    describe('receiving a change that pins Log source roots for a Harness', () => {
      let response: Response;
      let body: ApplicationSettings;

      beforeEach(async () => {
        response = await send(
          request({
            logSourceOverrides: {
              codex: ['/external/codex/live', '/external/codex/archive'],
            },
          }),
        );
        body = (await response.json()) as ApplicationSettings;
      });

      it('accepts the change', () => {
        expect(response.status).toBe(200);
      });

      it('resolves the Harness to the pinned roots', () => {
        expect(body.logSources).toMatchObject({
          codex: ['/external/codex/live', '/external/codex/archive'],
        });
      });

      it('records the pinned roots as the Harness override', () => {
        expect(body.logSourceOverrides).toEqual({
          codex: ['/external/codex/live', '/external/codex/archive'],
        });
      });

      it('leaves every other Harness on its built-in defaults', () => {
        const defaults = resolveDefaultLogSources();
        expect(body.logSources).toMatchObject({
          claude: defaults.claude,
          pi: defaults.pi,
          omp: defaults.omp,
        });
      });
    });

    describe('receiving a change that enables the Raw archive at a path that does not exist', () => {
      let archiveRoot: string;
      let response: Response;
      let body: ApplicationSettings;

      beforeEach(async () => {
        archiveRoot = join(dataDirectory, 'nested', 'archive');
        response = await send(
          request({
            rawArchiveEnabled: true,
            rawArchivePath: archiveRoot,
          }),
        );
        body = (await response.json()) as ApplicationSettings;
      });

      it('accepts the change', () => {
        expect(response.status).toBe(200);
      });

      it('reports the archive enabled at the requested path', () => {
        expect(body).toMatchObject({
          rawArchiveEnabled: true,
          rawArchivePath: archiveRoot,
        });
      });

      it('creates the archive directory, missing parents included', async () => {
        expect((await stat(archiveRoot)).isDirectory()).toBe(true);
      });
    });

    describe('receiving a change that enables the Raw archive without a path', () => {
      let response: Response;

      beforeEach(async () => {
        response = await send(request({ rawArchiveEnabled: true }));
      });

      it('refuses the change, an enabled archive having nowhere to write', async () => {
        expect({
          status: response.status,
          body: await response.json(),
        }).toEqual({ status: 400, body: { error: expect.any(String) } });
      });

      it('stores no Settings at all', () => {
        expect(storedSettings()).toBeUndefined();
      });
    });

    describe('receiving a change that enables the Raw archive where a file sits', () => {
      let occupiedPath: string;
      let response: Response;

      beforeEach(async () => {
        occupiedPath = join(dataDirectory, 'occupied');
        await writeFile(occupiedPath, 'not a directory');
        response = await send(
          request({
            rawArchiveEnabled: true,
            rawArchivePath: occupiedPath,
          }),
        );
      });

      it('refuses the change, the archive directory being uncreatable', async () => {
        expect({
          status: response.status,
          body: await response.json(),
        }).toEqual({ status: 400, body: { error: expect.any(String) } });
      });

      it('stores no Settings at all', () => {
        expect(storedSettings()).toBeUndefined();
      });
    });
  });

  describe('Settings with an enabled Raw archive', () => {
    let archiveRoot: string;

    beforeEach(() => {
      archiveRoot = join(dataDirectory, 'archive');
      persistSettings(connection.database, {
        rawArchiveEnabled: true,
        rawArchivePath: archiveRoot,
      });
    });

    describe('receiving a change that disables the archive and clears its path', () => {
      let response: Response;
      let body: ApplicationSettings;

      beforeEach(async () => {
        response = await send(
          request({
            rawArchiveEnabled: false,
            rawArchivePath: null,
          }),
        );
        body = (await response.json()) as ApplicationSettings;
      });

      it('accepts the change', () => {
        expect(response.status).toBe(200);
      });

      it('reports the archive disabled', () => {
        expect(body.rawArchiveEnabled).toBe(false);
      });

      it('reports the archive path cleared', () => {
        expect(body.rawArchivePath).toBeNull();
      });
    });

    describe('receiving a change that clears the path while the archive stays enabled', () => {
      let response: Response;

      beforeEach(async () => {
        response = await send(request({ rawArchivePath: null }));
      });

      it('refuses the change, an enabled archive requiring a path', async () => {
        expect({
          status: response.status,
          body: await response.json(),
        }).toEqual({ status: 400, body: { error: expect.any(String) } });
      });

      it('keeps the stored archive path', () => {
        expect(storedSettings()).toMatchObject({
          rawArchiveEnabled: true,
          rawArchivePath: archiveRoot,
        });
      });
    });
  });

  describe('Settings holding a legacy relative archive path', () => {
    beforeEach(() => {
      persistSettings(connection.database, {
        timezone: 'Europe/London',
        rawArchiveEnabled: false,
      });
      // Written past the Settings rules, as a release predating them would have.
      connection.database
        .update(settings)
        .set({
          rawArchiveEnabled: true,
          rawArchivePath: 'legacy/relative/archive',
        })
        .run();
    });

    describe('receiving a change to the timezone', () => {
      it('accepts the change, which does not touch the archive', async () => {
        const response = await send(request({ timezone: 'America/New_York' }));

        expect(response.status).toBe(200);
      });
    });

    describe('receiving a change to the Log sources', () => {
      let response: Response;
      let body: ApplicationSettings;

      beforeEach(async () => {
        response = await send(
          request({
            logSourceOverrides: { codex: ['/next/codex'] },
          }),
        );
        body = (await response.json()) as ApplicationSettings;
      });

      it('accepts the change, which does not touch the archive', () => {
        expect(response.status).toBe(200);
      });

      it('applies the pinned Log source roots', () => {
        expect(body.logSources).toMatchObject({ codex: ['/next/codex'] });
      });

      it('leaves the legacy archive values exactly as stored', () => {
        expect(body).toMatchObject({
          rawArchiveEnabled: true,
          rawArchivePath: 'legacy/relative/archive',
        });
      });
    });

    describe('receiving a change that touches the archive', () => {
      it('refuses the change, the stored path not being absolute', async () => {
        const response = await send(request({ rawArchiveEnabled: true }));

        expect({
          status: response.status,
          body: await response.json(),
        }).toEqual({ status: 400, body: { error: expect.any(String) } });
      });
    });
  });

  describe('Settings with pinned Log source overrides', () => {
    beforeEach(() => {
      persistSettings(connection.database, {
        logSourceOverrides: {
          codex: ['/external/codex/live', '/external/codex/archive'],
        },
      });
    });

    describe('receiving a change that resets a Harness to its defaults', () => {
      let response: Response;
      let body: ApplicationSettings;

      beforeEach(async () => {
        response = await send(request({ logSourceOverrides: { codex: null } }));
        body = (await response.json()) as ApplicationSettings;
      });

      it('accepts the change', () => {
        expect(response.status).toBe(200);
      });

      it('resolves the Harness to its built-in Log sources', () => {
        expect(body.logSources).toMatchObject({
          codex: resolveDefaultLogSources().codex,
        });
      });

      it('drops the Harness override', () => {
        expect(body.logSourceOverrides).toEqual({});
      });
    });
  });

  describe('Settings holding a timezone and a disabled archive path', () => {
    beforeEach(() => {
      persistSettings(connection.database, {
        timezone: 'Europe/London',
        rawArchivePath: '/existing/archive',
      });
    });

    describe('receiving a change to one section', () => {
      let response: Response;
      let body: ApplicationSettings;

      beforeEach(async () => {
        response = await send(request({ rawArchiveEnabled: false }));
        body = (await response.json()) as ApplicationSettings;
      });

      it('accepts the change', () => {
        expect(response.status).toBe(200);
      });

      it('applies the section the change carries', () => {
        expect(body.rawArchiveEnabled).toBe(false);
      });

      it('leaves the sections the change omits as stored', () => {
        expect(body).toMatchObject({
          timezone: 'Europe/London',
          rawArchivePath: '/existing/archive',
        });
      });

      it('resolves a Log source list for every Harness', () => {
        expect(body.logSources).toEqual(
          expect.objectContaining({
            claude: expect.any(Array),
            codex: expect.any(Array),
            pi: expect.any(Array),
            omp: expect.any(Array),
          }),
        );
      });

      it('reports no overrides while no Harness is pinned', () => {
        expect(body.logSourceOverrides).toEqual({});
      });

      it('returns the whole of Settings, carrying nothing besides', () => {
        expect(Object.keys(body).sort()).toEqual([
          'logSourceOverrides',
          'logSources',
          'rawArchiveEnabled',
          'rawArchivePath',
          'timezone',
        ]);
      });
    });

    describe('receiving a change that breaks a Settings rule', () => {
      const invalidChanges: ReadonlyArray<() => Request> = [
        () => malformedRequest('{'),
        () => request(42),
        () => request([]),
        () => request({ unknown: true }),
        () => request({ timezone: 42 }),
        () => request({ timezone: 'Not/A-Timezone' }),
        () => request({ rawArchiveEnabled: 'yes' }),
        () => request({ rawArchiveEnabled: true, rawArchivePath: '   ' }),
        () => request({ rawArchivePath: 42 }),
        () => request({ rawArchivePath: 'relative/archive' }),
        () => request({ logSourceOverrides: [] }),
        () => request({ logSourceOverrides: { codex: [] } }),
        () => request({ logSourceOverrides: { codex: 'one/path' } }),
        () => request({ logSourceOverrides: { codex: ['relative/logs'] } }),
        () => request({ logSourceOverrides: { unknown: ['/logs'] } }),
      ];

      let before: typeof settings.$inferSelect | undefined;

      beforeEach(() => {
        persistSettings(connection.database, {
          rawArchiveEnabled: false,
          logSourceOverrides: { codex: ['/existing/codex'] },
        });
        before = storedSettings();
      });

      it.each(invalidChanges)('refuses the change', async (build) => {
        const response = await send(build());

        expect({
          status: response.status,
          body: await response.json(),
        }).toEqual({ status: 400, body: { error: expect.any(String) } });
      });

      it.each(invalidChanges)(
        'leaves the stored Settings untouched',
        async (build) => {
          await send(build());

          expect(storedSettings()).toEqual(before);
        },
      );
    });
  });

  describe('Settings with an Interaction bucketed in the stored timezone', () => {
    beforeEach(() => {
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
    });

    describe('receiving a change that moves the timezone', () => {
      let response: Response;
      let body: ApplicationSettings;

      beforeEach(async () => {
        response = await send(request({ timezone: 'America/New_York' }));
        body = (await response.json()) as ApplicationSettings;
      });

      it('accepts the change', () => {
        expect(response.status).toBe(200);
      });

      it('reports the new timezone', () => {
        expect(body.timezone).toBe('America/New_York');
      });

      it('rebuilds the local buckets of every stored Interaction', () => {
        expect(
          connection.database.select().from(interactions).get(),
        ).toMatchObject({ localDow: 3, localHour: 7, localDate: '2025-01-15' });
      });
    });
  });

  describe('an ingest Job run in flight', () => {
    beforeEach(() => {
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
    });

    describe('receiving a change that moves the timezone', () => {
      let response: Response;
      let body: { error: string };

      beforeEach(async () => {
        response = await send(request({ timezone: 'America/New_York' }));
        body = (await response.json()) as { error: string };
      });

      it('refuses the change while ingestion is writing Interactions', () => {
        expect(response.status).toBe(409);
      });

      it('points at the running ingestion as the reason to retry', () => {
        expect(body).toEqual({
          error: expect.stringMatching(/ingest.*running.*retry/i),
        });
      });

      it('keeps the stored timezone', () => {
        expect(storedSettings()).toMatchObject({ timezone: 'Europe/London' });
      });
    });

    describe('receiving a timezone that is not a known zone', () => {
      it('refuses it as invalid before the Job run is consulted', async () => {
        const response = await send(request({ timezone: 'Not/A-Timezone' }));

        expect({
          status: response.status,
          body: await response.json(),
        }).toEqual({ status: 400, body: { error: expect.any(String) } });
      });
    });

    describe('receiving a change that moves the timezone alongside the archive', () => {
      let strayArchiveRoot: string;
      let response: Response;

      beforeEach(async () => {
        strayArchiveRoot = join(dataDirectory, 'stray-archive');
        response = await send(
          request({
            timezone: 'America/New_York',
            rawArchiveEnabled: true,
            rawArchivePath: strayArchiveRoot,
          }),
        );
      });

      it('refuses the whole change', () => {
        expect(response.status).toBe(409);
      });

      it('leaves the archive section as stored', () => {
        expect(storedSettings()).toMatchObject({
          rawArchiveEnabled: false,
          rawArchivePath: null,
        });
      });

      // ADR-0011: the directory is created before the synchronous transaction,
      // so a refusal leaves it behind rather than committing an uncreated path.
      it('leaves behind the archive directory it had already created', async () => {
        expect((await stat(strayArchiveRoot)).isDirectory()).toBe(true);
      });
    });

    describe('receiving a change that leaves the timezone alone', () => {
      let response: Response;
      let body: ApplicationSettings;

      beforeEach(async () => {
        response = await send(
          request({
            rawArchiveEnabled: false,
            rawArchivePath: '/next/archive',
            logSourceOverrides: { codex: ['/next/codex'] },
          }),
        );
        body = (await response.json()) as ApplicationSettings;
      });

      it('accepts the change', () => {
        expect(response.status).toBe(200);
      });

      it('applies the archive path', () => {
        expect(body.rawArchivePath).toBe('/next/archive');
      });

      it('applies the pinned Log source roots', () => {
        expect(body.logSources).toMatchObject({ codex: ['/next/codex'] });
      });
    });
  });
});
