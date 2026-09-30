CREATE TABLE `academic_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_terms_name_unique` ON `academic_terms` (`name`);--> statement-breakpoint
ALTER TABLE `classrooms` ADD `term_id` text;