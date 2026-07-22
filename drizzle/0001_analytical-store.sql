CREATE TABLE `checkpoint` (
	`harness` text NOT NULL,
	`stable_session_id` text NOT NULL,
	`last_complete_record_byte_offset` integer NOT NULL,
	`file_size` integer NOT NULL,
	`file_mtime` integer NOT NULL,
	PRIMARY KEY(`harness`, `stable_session_id`),
	CONSTRAINT "checkpoint_last_complete_record_byte_offset_nonnegative" CHECK("checkpoint"."last_complete_record_byte_offset" >= 0),
	CONSTRAINT "checkpoint_file_size_nonnegative" CHECK("checkpoint"."file_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE `interaction` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`opening_user_record_id` text NOT NULL,
	`harness` text NOT NULL,
	`project_id` integer NOT NULL,
	`model` text NOT NULL,
	`model_raw` text NOT NULL,
	`main_input_tokens` integer,
	`main_output_tokens` integer,
	`main_cache_read_tokens` integer,
	`main_cache_write_tokens` integer,
	`sub_input_tokens` integer,
	`sub_output_tokens` integer,
	`sub_cache_read_tokens` integer,
	`sub_cache_write_tokens` integer,
	`timestamp` integer NOT NULL,
	`local_dow` integer NOT NULL,
	`local_hour` integer NOT NULL,
	`local_date` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "interaction_local_dow_range" CHECK("interaction"."local_dow" between 0 and 6),
	CONSTRAINT "interaction_local_hour_range" CHECK("interaction"."local_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interaction_session_id_opening_user_record_id_unique` ON `interaction` (`session_id`,`opening_user_record_id`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`root_path` text NOT NULL,
	`git_remote_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_root_path_unique` ON `project` (`root_path`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`harness` text NOT NULL,
	`stable_session_id` text NOT NULL,
	`project_id` integer NOT NULL,
	`log_file_path` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_harness_stable_session_id_unique` ON `session` (`harness`,`stable_session_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`timezone` text NOT NULL,
	`raw_archive_enabled` integer NOT NULL,
	`raw_archive_path` text,
	`log_source_overrides` text NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id" = 1)
);
