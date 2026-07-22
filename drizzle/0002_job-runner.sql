CREATE TABLE `job_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`correlation_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`error` text,
	`files_total` integer DEFAULT 0 NOT NULL,
	`files_done` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "job_run_type_nonempty" CHECK(length("job_run"."type") > 0),
	CONSTRAINT "job_run_status_valid" CHECK("job_run"."status" in ('pending', 'running', 'succeeded', 'failed', 'interrupted')),
	CONSTRAINT "job_run_progress_valid" CHECK("job_run"."files_total" >= 0 and "job_run"."files_done" >= 0 and "job_run"."files_done" <= "job_run"."files_total"),
	CONSTRAINT "job_run_timing_valid" CHECK(("job_run"."started_at" is null or "job_run"."started_at" >= 0) and ("job_run"."finished_at" is null or ("job_run"."started_at" is not null and "job_run"."finished_at" >= "job_run"."started_at"))),
	CONSTRAINT "job_run_lifecycle_valid" CHECK((
        ("job_run"."status" = 'pending' and "job_run"."started_at" is null and "job_run"."finished_at" is null and "job_run"."error" is null)
        or ("job_run"."status" = 'running' and "job_run"."started_at" is not null and "job_run"."finished_at" is null and "job_run"."error" is null)
        or ("job_run"."status" in ('succeeded', 'interrupted') and "job_run"."started_at" is not null and "job_run"."finished_at" is not null and "job_run"."error" is null)
        or ("job_run"."status" = 'failed' and "job_run"."started_at" is not null and "job_run"."finished_at" is not null and "job_run"."error" is not null)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_run_correlation_id_unique` ON `job_run` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `job_run_identity_status_index` ON `job_run` (`type`,`scope`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_run_running_identity_unique` ON `job_run` (`type`,`scope`) WHERE "job_run"."status" = 'running';