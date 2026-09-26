CREATE TABLE `plans` (
	`key` text PRIMARY KEY NOT NULL,
	`student` text NOT NULL,
	`subject` text NOT NULL,
	`teacher_name` text NOT NULL,
	`duration` real DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teachers` (
	`name` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
DROP TABLE `sync_targets`;