import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

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
    openingUserRecordId: text('opening_user_record_id').notNull(),
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
    timestamp: integer('timestamp').notNull(),
    localDow: integer('local_dow').notNull(),
    localHour: integer('local_hour').notNull(),
    localDate: text('local_date').notNull(),
  },
  (table) => [
    unique().on(table.sessionId, table.openingUserRecordId),
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
