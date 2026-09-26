CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'pending' NOT NULL,
	`teacher_name` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`plan_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_unique` ON `assignments` (`account_id`,`plan_key`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`student` text NOT NULL,
	`subject` text NOT NULL,
	`teacher_name` text NOT NULL,
	`planned_start` text NOT NULL,
	`planned_end` text NOT NULL,
	`actual_start` text,
	`actual_end` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`note` text,
	`chargeable` integer,
	`reviewed_at` text,
	`reviewed_by` text,
	`kind` text DEFAULT 'regular' NOT NULL,
	`series_id` text,
	`replacement_for` text,
	`created_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` text NOT NULL
);
