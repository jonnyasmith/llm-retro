import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { harnesses } from '../../jobs/contracts';
import type { Database } from './connection';
import type { JobIdentity } from '../jobs/types';
import type {
  ApplicationSettings,
  LogSources,
  SettingsChanges,
} from '../../settings/contracts';
import { IngestionActiveError } from '../settings/errors';
import { interactions, jobRuns, projects, sessions, settings } from './schema';
import { deriveLocalBuckets } from './time-buckets';
import { providerOf } from '../model';

export type {
  ApplicationSettings,
  LogSources,
  SettingsChanges,
} from '../../settings/contracts';

type NewInteraction = typeof interactions.$inferInsert;
type StoredInteraction = typeof interactions.$inferSelect;
type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

function resolveOperatingSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function resolveDefaultLogSources(
  homeDirectory: string = homedir(),
): LogSources {
  return {
    claude: [join(homeDirectory, '.claude', 'projects')],
    codex: [
      join(homeDirectory, '.codex', 'sessions'),
      join(homeDirectory, '.codex', 'archived_sessions'),
    ],
    pi: [join(homeDirectory, '.pi', 'agent', 'sessions')],
    omp: [join(homeDirectory, '.omp', 'agent', 'sessions')],
  };
}

export function getSettings(
  database: Database,
  operatingSystemTimezone: () => string = resolveOperatingSystemTimezone,
): ApplicationSettings {
  const stored = database.select().from(settings).get();

  return {
    timezone: stored?.timezone ?? operatingSystemTimezone(),
    rawArchiveEnabled: stored?.rawArchiveEnabled ?? false,
    rawArchivePath: stored?.rawArchivePath ?? null,
    logSourceOverrides: stored?.logSourceOverrides ?? {},
    logSources: {
      ...resolveDefaultLogSources(),
      ...(stored?.logSourceOverrides ?? {}),
    },
  };
}

export function persistSettings(
  database: Database,
  changes: SettingsChanges,
  options: { rejectTimezoneChangeDuringIngestion?: boolean } = {},
): ApplicationSettings {
  const stored = database.select().from(settings).get();
  const current = getSettings(database);
  const logSourceOverrides = { ...(stored?.logSourceOverrides ?? {}) };
  for (const harness of harnesses) {
    const paths = changes.logSourceOverrides?.[harness];
    if (paths === undefined) continue;
    if (paths === null) {
      delete logSourceOverrides[harness];
    } else {
      logSourceOverrides[harness] = paths;
    }
  }
  const values = {
    timezone: changes.timezone ?? current.timezone,
    rawArchiveEnabled: changes.rawArchiveEnabled ?? current.rawArchiveEnabled,
    rawArchivePath:
      changes.rawArchivePath === undefined
        ? current.rawArchivePath
        : changes.rawArchivePath,
    logSourceOverrides,
  };
  deriveLocalBuckets(0, values.timezone);

  database.transaction((transaction) => {
    if (current.timezone !== values.timezone) {
      if (options.rejectTimezoneChangeDuringIngestion) {
        const activeIngestion = transaction
          .select({ id: jobRuns.id })
          .from(jobRuns)
          .where(and(eq(jobRuns.type, 'ingest'), eq(jobRuns.status, 'running')))
          .get();
        if (activeIngestion) {
          throw new IngestionActiveError(
            'An Ingestion run is running; retry when it has finished',
          );
        }
      }
      recomputeWithTransaction(transaction, values.timezone);
    }

    transaction
      .insert(settings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: settings.id, set: values })
      .run();
  });

  return getSettings(database);
}

export function insertInteraction(
  database: Database,
  interaction: NewInteraction,
): StoredInteraction {
  database
    .insert(interactions)
    .values(interaction)
    .onConflictDoNothing({
      target: [interactions.sessionId, interactions.interactionKey],
    })
    .run();

  const stored = database
    .select()
    .from(interactions)
    .where(
      and(
        eq(interactions.sessionId, interaction.sessionId),
        eq(interactions.interactionKey, interaction.interactionKey),
      ),
    )
    .get();

  if (!stored) throw new Error('Interaction insertion did not persist a row');
  return stored;
}

export function listJobRuns(
  database: Database,
  identity: JobIdentity,
  limit = 50,
) {
  const scope = identity.scope ?? '';
  return database
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.type, identity.type), eq(jobRuns.scope, scope)))
    .orderBy(desc(jobRuns.id))
    .limit(limit)
    .all();
}

export function hasActiveIngestRun(database: Database): boolean {
  return (
    database
      .select({ id: jobRuns.id })
      .from(jobRuns)
      .where(and(eq(jobRuns.type, 'ingest'), eq(jobRuns.status, 'running')))
      .get() !== undefined
  );
}

type TokenColumn = AnySQLiteColumn;

const allTokenColumns: TokenColumn[] = [
  interactions.mainInputTokens,
  interactions.mainOutputTokens,
  interactions.mainCacheReadTokens,
  interactions.mainCacheWriteTokens,
  interactions.subInputTokens,
  interactions.subOutputTokens,
  interactions.subCacheReadTokens,
  interactions.subCacheWriteTokens,
];

// The CASE keeps a bucket null when every row is null, rather than SUM's
// coalesce-to-zero, so genuine absence never reads as a real zero.
function nullAwareSum(columns: TokenColumn[]) {
  const allNull = sql.join(
    columns.map((column) => sql`${column} is null`),
    sql` and `,
  );
  const reportedSum = sql.join(
    columns.map((column) => sql`coalesce(${column}, 0)`),
    sql` + `,
  );
  return sql<
    number | null
  >`sum(case when ${allNull} then null else ${reportedSum} end)`;
}

export function getOverviewTotals(database: Database) {
  // An aggregate select with no grouping always returns exactly one row.
  const [totals] = database
    .select({
      interactionCount: count(),
      totalTokens: nullAwareSum(allTokenColumns),
    })
    .from(interactions)
    .all();

  // Every rollup consumer renders an absent bucket as an em dash; the overview
  // renders its total through a plain number formatter with no absent branch,
  // so an empty store must read as a genuine zero. A deliberate divergence from
  // the null-not-zero rule, named so it stays a visible decision rather than a
  // second, silently different SQL expression.
  const absentTotalAsZero = totals.totalTokens ?? 0;

  return {
    interactionCount: totals.interactionCount,
    totalTokens: absentTotalAsZero,
  };
}

export function getActivityHeatmap(database: Database) {
  return database
    .select({
      localDow: interactions.localDow,
      localHour: interactions.localHour,
      interactionCount: count(),
    })
    .from(interactions)
    .groupBy(interactions.localDow, interactions.localHour)
    .orderBy(interactions.localDow, interactions.localHour)
    .all();
}

// Combined display buckets pair each main column with its sub column; the total
// spans all eight.
function tokenRollup() {
  return {
    inputTokens: nullAwareSum([
      interactions.mainInputTokens,
      interactions.subInputTokens,
    ]),
    outputTokens: nullAwareSum([
      interactions.mainOutputTokens,
      interactions.subOutputTokens,
    ]),
    cacheReadTokens: nullAwareSum([
      interactions.mainCacheReadTokens,
      interactions.subCacheReadTokens,
    ]),
    cacheWriteTokens: nullAwareSum([
      interactions.mainCacheWriteTokens,
      interactions.subCacheWriteTokens,
    ]),
    totalTokens: nullAwareSum(allTokenColumns),
  };
}

export function getProjectBreakdown(database: Database) {
  return database
    .select({
      projectId: interactions.projectId,
      rootPath: projects.rootPath,
      gitRemoteUrl: projects.gitRemoteUrl,
      interactionCount: count(),
      ...tokenRollup(),
    })
    .from(interactions)
    .innerJoin(projects, eq(interactions.projectId, projects.id))
    .groupBy(interactions.projectId)
    .orderBy(desc(count()), projects.rootPath)
    .all();
}

export function getHarnessBreakdown(database: Database) {
  return database
    .select({
      harness: interactions.harness,
      interactionCount: count(),
      ...tokenRollup(),
    })
    .from(interactions)
    .groupBy(interactions.harness)
    .orderBy(desc(count()), interactions.harness)
    .all();
}

export function getModelBreakdown(database: Database) {
  const rows = database
    .select({
      model: interactions.model,
      interactionCount: count(),
      ...tokenRollup(),
    })
    .from(interactions)
    .groupBy(interactions.model)
    .orderBy(desc(count()), interactions.model)
    .all();

  return rows.map((row) => ({ ...row, provider: providerOf(row.model) }));
}

export function getSessionShape(database: Database) {
  const duration = sql<
    number | null
  >`case when ${sessions.startedAt} is not null and ${sessions.endedAt} is not null and ${sessions.endedAt} > ${sessions.startedAt} then ${sessions.endedAt} - ${sessions.startedAt} end`;
  const durationExcluded = sql<number>`sum(case when ${sessions.startedAt} is null or ${sessions.endedAt} is null or ${sessions.endedAt} <= ${sessions.startedAt} then 1 else 0 end)`;

  const sessionRows = database
    .select({
      harness: sessions.harness,
      sessionCount: count(),
      averageDurationMs: sql<number | null>`avg(${duration})`,
      durationExcluded,
    })
    .from(sessions)
    .groupBy(sessions.harness)
    .all();

  const interactionRows = database
    .select({
      harness: interactions.harness,
      interactionCount: count(),
    })
    .from(interactions)
    .groupBy(interactions.harness)
    .all();
  const interactionsByHarness = new Map(
    interactionRows.map((row) => [row.harness, row.interactionCount]),
  );

  const byHarness = sessionRows
    .map((row) => {
      const interactionCount = interactionsByHarness.get(row.harness) ?? 0;
      return {
        harness: row.harness,
        sessionCount: row.sessionCount,
        interactionCount,
        averageInteractionsPerSession:
          row.sessionCount === 0 ? 0 : interactionCount / row.sessionCount,
        averageDurationMs: row.averageDurationMs,
        durationExcluded: row.durationExcluded,
      };
    })
    .sort(
      (a, b) =>
        b.sessionCount - a.sessionCount || a.harness.localeCompare(b.harness),
    );

  const overall = database
    .select({
      sessionCount: count(),
      averageDurationMs: sql<number | null>`avg(${duration})`,
      durationExcluded,
    })
    .from(sessions)
    .get();
  const totalInteractions = interactionRows.reduce(
    (sum, row) => sum + row.interactionCount,
    0,
  );
  const sessionCount = overall?.sessionCount ?? 0;

  return {
    totals: {
      sessionCount,
      interactionCount: totalInteractions,
      averageInteractionsPerSession:
        sessionCount === 0 ? 0 : totalInteractions / sessionCount,
      averageDurationMs: overall?.averageDurationMs ?? null,
      durationExcluded: overall?.durationExcluded ?? 0,
    },
    byHarness,
  };
}

export function recomputeLocalBuckets(
  database: Database,
  timezone: string,
): number {
  deriveLocalBuckets(0, timezone);
  return database.transaction((transaction) =>
    recomputeWithTransaction(transaction, timezone),
  );
}

function recomputeWithTransaction(
  transaction: DatabaseTransaction,
  timezone: string,
): number {
  const storedInteractions = transaction
    .select({ id: interactions.id, timestamp: interactions.timestamp })
    .from(interactions)
    .all();

  for (const interaction of storedInteractions) {
    transaction
      .update(interactions)
      .set(deriveLocalBuckets(interaction.timestamp, timezone))
      .where(eq(interactions.id, interaction.id))
      .run();
  }

  return storedInteractions.length;
}
