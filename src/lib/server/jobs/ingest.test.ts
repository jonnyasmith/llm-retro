import { afterEach, describe, expect, it, vi } from 'vitest';
import { harnesses, type Harness } from '../../jobs/contracts';
import type { Database } from '../database/connection';
import { interactions, sessions } from '../database/schema';
import {
  appendJsonLines,
  cleanupIngestFixtures,
  createIngestFixture,
  sessionGrowthScenarios,
  writeJsonLines,
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
  it('stores the Session and every Interaction its log records', async () => {
    const scenario = sessionGrowthScenarios[harness](STABLE_SESSION_ID);
    const fixture = await createIngestFixture(harness);
    const sessionPath = fixture.sessionPath(STABLE_SESSION_ID);
    await writeJsonLines(sessionPath, [
      ...scenario.initialRecords,
      ...scenario.appendedRecords,
    ]);

    try {
      await run(harness, fixture.database, 'first-ingest');

      expect(fixture.database.select().from(sessions).all()).toEqual([
        expect.objectContaining({
          harness,
          stableSessionId: STABLE_SESSION_ID,
          logFilePath: sessionPath,
        }),
      ]);
      expect(
        fixture.database.select(TOTALS_COLUMNS).from(interactions).all(),
      ).toEqual(scenario.expectedTotals);
    } finally {
      fixture.close();
    }
  });

  it('rebuilds an in-flight Interaction consistently when a session grows', async () => {
    const scenario = sessionGrowthScenarios[harness](STABLE_SESSION_ID);
    const fixture = await createIngestFixture(harness);
    const fullFixture = await createIngestFixture(harness);
    await writeJsonLines(
      fixture.sessionPath(STABLE_SESSION_ID),
      scenario.initialRecords,
    );

    try {
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

      const resumedTotals = fixture.database
        .select(TOTALS_COLUMNS)
        .from(interactions)
        .all();
      expect(resumedTotals).toEqual(
        fullFixture.database.select(TOTALS_COLUMNS).from(interactions).all(),
      );
      expect(resumedTotals).toEqual(scenario.expectedTotals);
    } finally {
      fixture.close();
      fullFixture.close();
    }
  });
});
