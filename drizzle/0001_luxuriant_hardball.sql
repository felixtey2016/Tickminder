CREATE TABLE `sync_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`plan_key` text NOT NULL,
	`last_synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_target_month_plan` ON `sync_targets` (`month`,`plan_key`);