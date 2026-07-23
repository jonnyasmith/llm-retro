import { and, count, desc, eq, sql } from 'drizzle-orm';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Database } from './connection';
import type { JobIdentity } from '../jobs/types';
import { interactions, jobRuns, settings } from './schema';
import { deriveLocalBuckets } from './time-buckets';

export type Harness = 'claude' | 'codex' | 'pi' | 'omp';
export type LogSources = Record<Harness, string[]>;

export interface ApplicationSettings {
  timezone: string;
  rawArchiveEnabled: boolean;
  rawArchivePath: string | null;
  logSources: LogSources;
}

export interface SettingsChanges {
  timezone?: string;
  rawArchiveEnabled?: boolean;
  rawArchivePath?: string | null;
  logSourceOverrides?: Partial<LogSources>;
}

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
    logSources: {
      ...resolveDefaultLogSources(),
      ...(stored?.logSourceOverrides ?? {}),
    },
  };
}

export function updateSettings(
  database: Database,
  changes: SettingsChanges,
): ApplicationSettings {
  const stored = database.select().from(settings).get();
  const current = getSettings(database);
  const values = {
    timezone: changes.timezone ?? current.timezone,
    rawArchiveEnabled: changes.rawArchiveEnabled ?? current.rawArchiveEnabled,
    rawArchivePath:
      changes.rawArchivePath === undefined
        ? current.rawArchivePath
        : changes.rawArchivePath,
    logSourceOverrides: {
      ...(stored?.logSourceOverrides ?? {}),
      ...(changes.logSourceOverrides ?? {}),
    },
  };
  deriveLocalBuckets(0, values.timezone);

  database.transaction((transaction) => {
    if (current.timezone !== values.timezone) {
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

export function getOverviewTotals(database: Database) {
  const totals = database
    .select({
      interactionCount: count(),
      totalTokens: sql<number>`coalesce(sum(
        coalesce(${interactions.mainInputTokens}, 0) +
        coalesce(${interactions.mainOutputTokens}, 0) +
        coalesce(${interactions.mainCacheReadTokens}, 0) +
        coalesce(${interactions.mainCacheWriteTokens}, 0) +
        coalesce(${interactions.subInputTokens}, 0) +
        coalesce(${interactions.subOutputTokens}, 0) +
        coalesce(${interactions.subCacheReadTokens}, 0) +
        coalesce(${interactions.subCacheWriteTokens}, 0)
      ), 0)`,
    })
    .from(interactions)
    .get();

  return totals ?? { interactionCount: 0, totalTokens: 0 };
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
