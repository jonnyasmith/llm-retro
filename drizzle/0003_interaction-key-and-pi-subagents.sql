ALTER TABLE `interaction` RENAME COLUMN "opening_user_record_id" TO "interaction_key";--> statement-breakpoint
DROP INDEX `interaction_session_id_opening_user_record_id_unique`;--> statement-breakpoint
ALTER TABLE `interaction` ADD `spawned_subagents` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `interaction_session_id_interaction_key_unique` ON `interaction` (`session_id`,`interaction_key`);