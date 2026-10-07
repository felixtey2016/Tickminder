CREATE TABLE `meet_connections` (
	`account_id` text PRIMARY KEY NOT NULL,
	`google_subject` text NOT NULL,
	`google_email` text NOT NULL,
	`refresh_cipher` text NOT NULL,
	`connected_at` text NOT NULL,
	`last_error` text,
	`version` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `meet_connections_google_subject_unique` ON `meet_connections` (`google_subject`);
--> statement-breakpoint
CREATE TABLE `meet_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`verifier_cipher` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE TABLE `meet_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`meeting_code` text NOT NULL,
	`planned_start` text NOT NULL,
	`planned_end` text NOT NULL,
	`evidence_json` text,
	`synced_at` text,
	`last_error` text,
	`next_sync_at` text NOT NULL,
	`attempted_at` text,
	`lock_until` text,
	`lock_id` text,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE INDEX `meet_observation_due_idx` ON `meet_observations` (`next_sync_at`);
--> statement-breakpoint
CREATE INDEX `meet_observation_lesson_idx` ON `meet_observations` (`lesson_id`);
--> statement-breakpoint
CREATE TABLE `meet_runtime` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_dispatch_at` text NOT NULL
);
