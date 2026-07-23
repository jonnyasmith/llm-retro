PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`harness` text NOT NULL,
	`stable_session_id` text NOT NULL,
	`project_id` integer,
	`log_file_path` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_session`("id", "harness", "stable_session_id", "project_id", "log_file_path", "started_at", "ended_at") SELECT "id", "harness", "stable_session_id", "project_id", "log_file_path", "started_at", "ended_at" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `session_harness_stable_session_id_unique` ON `session` (`harness`,`stable_session_id`);