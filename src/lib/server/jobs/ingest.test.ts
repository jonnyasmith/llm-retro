import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harnesses, type Harness } from '../../jobs/contracts';
import type { Database } from '../database/connection';
import { interactions, sessions } from '../database/schema';
import {
  appendJsonLines,
  cleanupIngestFixtures,
  createIngestFixture,
  sessionGrowthScenarios,
  writeJsonLines,
  type IngestFixture,
} from './ingest-fixture';
import { createIngestHandler } from './ingest-pipeline';
import { ingestAdapters } from './ingest-registry';
import { literalCwdProjectResolver } from './project-resolver';

const TOTALS_COLUMNS = {
  interactionKey: interactions.interactionKey,
  model: interactions.model,
  mainInputTokens: interactions.mainInputTokens,
  mainOutputTokens: interactions.mainOutputTokens,
  mainCacheReadTokens: interactions.mainCacheReadTokens,
  mainCacheWriteTokens: interactions.mainCacheWriteTokens,
};

const STABLE_SESSION_ID = '33333333-3333-4333-8333-333333333333';

const run = (harness: Harness, database: Database, correlationId: string) =>
  createIngestHandler(ingestAdapters[harness], {
    resolveProject: literalCwdProjectResolver,
  }).run(null, {
    correlationId,
    database,
    progress: vi.fn(),
    log: vi.fn(),
  });

afterEach(cleanupIngestFixtures);

describe.each(harnesses)('%s ingest', (harness) => {
  const scenario = sessionGrowthScenarios[harness](STABLE_SESSION_ID);

  describe('a Session log read in one pass', () => {
    let fixture: IngestFixture;
    let sessionPath: string;

    beforeEach(async () => {
      fixture = await createIngestFixture(harness);
      sessionPath = fixture.sessionPath(STABLE_SESSION_ID);
      await writeJsonLines(sessionPath, [
        ...scenario.initialRecords,
        ...scenario.appendedRecords,
      ]);
      await run(harness, fixture.database, 'first-ingest');
    });

    afterEach(() => {
      fixture.close();
    });

    it('stores the Session against the log file it was read from', () => {
      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          harness,
          stableSessionId: STABLE_SESSION_ID,
          logFilePath: sessionPath,
        }),
      ]);
    });

    it('stores every Interaction the log records', () => {
      expect(
        fixture.database.select(TOTALS_COLUMNS).from(interactions).all(),
      ).toEqual(scenario.expectedTotals);
    });
  });

  describe('a Session log that grew since the last ingest', () => {
    let fixture: IngestFixture;
    let fullFixture: IngestFixture;
    let resumedTotals: unknown[];

    beforeEach(async () => {
      fixture = await createIngestFixture(harness);
      fullFixture = await createIngestFixture(harness);
      await writeJsonLines(
        fixture.sessionPath(STABLE_SESSION_ID),
        scenario.initialRecords,
      );
      await run(harness, fixture.database, 'before-growth');
      await appendJsonLines(
        fixture.sessionPath(STABLE_SESSION_ID),
        scenario.appendedRecords,
      );
      await run(harness, fixture.database, 'after-growth');
      await writeJsonLines(fullFixture.sessionPath(STABLE_SESSION_ID), [
        ...scenario.initialRecords,
        ...scenario.appendedRecords,
      ]);
      await run(harness, fullFixture.database, 'full-ingest');
      resumedTotals = fixture.database
        .select(TOTALS_COLUMNS)
        .from(interactions)
        .all();
    });

    afterEach(() => {
      fixture.close();
      fullFixture.close();
    });

    it('rebuilds the in-flight Interaction to the totals the whole log records', () => {
      expect(resumedTotals).toEqual(scenario.expectedTotals);
    });

    it('leaves the Store indistinguishable from one ingest of the whole log', () => {
      expect(resumedTotals).toEqual(
        fullFixture.database.select(TOTALS_COLUMNS).from(interactions).all(),
      );
    });
  });
});
