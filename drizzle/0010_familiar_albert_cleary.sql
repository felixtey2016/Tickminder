CREATE TABLE `classroom_announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`classroom_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `classroom_members` (
	`id` text PRIMARY KEY NOT NULL,
	`classroom_id` text NOT NULL,
	`student_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classroom_member_unique` ON `classroom_members` (`classroom_id`,`student_name`);--> statement-breakpoint
CREATE TABLE `classrooms` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`subject` text NOT NULL,
	`teacher_name` text NOT NULL,
	`created_by` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `homework` ADD `classroom_id` text;--> statement-breakpoint
ALTER TABLE `teaching_materials` ADD `classroom_id` text;