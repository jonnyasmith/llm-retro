import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { jobRunStatuses, type JobRunStatus } from '../../jobs/contracts';

export const projects = sqliteTable('project', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rootPath: text('root_path').notNull().unique(),
  gitRemoteUrl: text('git_remote_url'),
});

export const sessions = sqliteTable(
  'session',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    harness: text('harness').notNull(),
    stableSessionId: text('stable_session_id').notNull(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    logFilePath: text('log_file_path').notNull(),
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),
  },
  (table) => [unique().on(table.harness, table.stableSessionId)],
);

export const interactions = sqliteTable(
  'interaction',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    interactionKey: text('interaction_key').notNull(),
    harness: text('harness').notNull(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    model: text('model').notNull(),
    modelRaw: text('model_raw').notNull(),
    mainInputTokens: integer('main_input_tokens'),
    mainOutputTokens: integer('main_output_tokens'),
    mainCacheReadTokens: integer('main_cache_read_tokens'),
    mainCacheWriteTokens: integer('main_cache_write_tokens'),
    subInputTokens: integer('sub_input_tokens'),
    subOutputTokens: integer('sub_output_tokens'),
    subCacheReadTokens: integer('sub_cache_read_tokens'),
    subCacheWriteTokens: integer('sub_cache_write_tokens'),
    spawnedSubagents: integer('spawned_subagents', { mode: 'boolean' })
      .notNull()
      .default(false),
    timestamp: integer('timestamp').notNull(),
    localDow: integer('local_dow').notNull(),
    localHour: integer('local_hour').notNull(),
    localDate: text('local_date').notNull(),
  },
  (table) => [
    unique().on(table.sessionId, table.interactionKey),
    check(
      'interaction_local_dow_range',
      sql`${table.localDow} between 0 and 6`,
    ),
    check(
      'interaction_local_hour_range',
      sql`${table.localHour} between 0 and 23`,
    ),
  ],
);

export const checkpoints = sqliteTable(
  'checkpoint',
  {
    harness: text('harness').notNull(),
    stableSessionId: text('stable_session_id').notNull(),
    lastCompleteRecordByteOffset: integer(
      'last_complete_record_byte_offset',
    ).notNull(),
    fileSize: integer('file_size').notNull(),
    fileMtime: integer('file_mtime').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.harness, table.stableSessionId] }),
    check(
      'checkpoint_last_complete_record_byte_offset_nonnegative',
      sql`${table.lastCompleteRecordByteOffset} >= 0`,
    ),
    check('checkpoint_file_size_nonnegative', sql`${table.fileSize} >= 0`),
  ],
);

export { jobRunStatuses, type JobRunStatus };

export const jobRuns = sqliteTable(
  'job_run',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    scope: text('scope').notNull().default(''),
    correlationId: text('correlation_id').notNull().unique(),
    status: text('status').$type<JobRunStatus>().notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    error: text('error'),
    filesTotal: integer('files_total').notNull().default(0),
    filesDone: integer('files_done').notNull().default(0),
  },
  (table) => [
    check('job_run_type_nonempty', sql`length(${table.type}) > 0`),
    check(
      'job_run_status_valid',
      sql`${table.status} in ('pending', 'running', 'succeeded', 'failed', 'interrupted')`,
    ),
    check(
      'job_run_progress_valid',
      sql`${table.filesTotal} >= 0 and ${table.filesDone} >= 0 and ${table.filesDone} <= ${table.filesTotal}`,
    ),
    check(
      'job_run_timing_valid',
      sql`(${table.startedAt} is null or ${table.startedAt} >= 0) and (${table.finishedAt} is null or (${table.startedAt} is not null and ${table.finishedAt} >= ${table.startedAt}))`,
    ),
    check(
      'job_run_lifecycle_valid',
      sql`(
        (${table.status} = 'pending' and ${table.startedAt} is null and ${table.finishedAt} is null and ${table.error} is null)
        or (${table.status} = 'running' and ${table.startedAt} is not null and ${table.finishedAt} is null and ${table.error} is null)
        or (${table.status} in ('succeeded', 'interrupted') and ${table.startedAt} is not null and ${table.finishedAt} is not null and ${table.error} is null)
        or (${table.status} = 'failed' and ${table.startedAt} is not null and ${table.finishedAt} is not null and ${table.error} is not null)
      )`,
    ),
    index('job_run_identity_status_index').on(
      table.type,
      table.scope,
      table.status,
    ),
    uniqueIndex('job_run_running_identity_unique')
      .on(table.type, table.scope)
      .where(sql`${table.status} = 'running'`),
  ],
);

export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey(),
    timezone: text('timezone').notNull(),
    rawArchiveEnabled: integer('raw_archive_enabled', {
      mode: 'boolean',
    }).notNull(),
    rawArchivePath: text('raw_archive_path'),
    logSourceOverrides: text('log_source_overrides', { mode: 'json' })
      .$type<Record<string, string[]>>()
      .notNull(),
  },
  (table) => [check('settings_singleton', sql`${table.id} = 1`)],
);
