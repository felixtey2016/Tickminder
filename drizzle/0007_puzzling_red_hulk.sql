CREATE TABLE `homework` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`starts_at` text NOT NULL,
	`due_at` text NOT NULL,
	`attachment_file_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `homework_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`homework_id` text NOT NULL,
	`student_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `homework_recipient_unique` ON `homework_recipients` (`homework_id`,`student_name`);--> statement-breakpoint
CREATE TABLE `homework_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`homework_id` text NOT NULL,
	`student_name` text NOT NULL,
	`file_id` text NOT NULL,
	`submitted_at` text NOT NULL,
	`late` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `homework_submissions_file_id_unique` ON `homework_submissions` (`file_id`);--> statement-breakpoint
CREATE TABLE `material_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`student_name` text NOT NULL,
	`subject` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_recipient_unique` ON `material_recipients` (`material_id`,`student_name`,`subject`);--> statement-breakpoint
CREATE TABLE `pdf_files` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`context_id` text,
	`filename` text NOT NULL,
	`bytes` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pdf_files_object_key_unique` ON `pdf_files` (`object_key`);--> statement-breakpoint
CREATE TABLE `storage_quota` (
	`id` integer PRIMARY KEY NOT NULL,
	`used_bytes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`title` text NOT NULL,
	`subject` text,
	`note` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`homework_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teaching_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`file_id` text NOT NULL,
	`created_at` text NOT NULL
);
