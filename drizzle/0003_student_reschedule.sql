ALTER TABLE `accounts` ADD `student_name` text;
--> statement-breakpoint
ALTER TABLE `lessons` ADD `attendance_kind` text;
--> statement-breakpoint
CREATE TABLE `reschedule_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`original_start` text NOT NULL,
	`original_end` text NOT NULL,
	`proposed_start` text NOT NULL,
	`proposed_end` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`requested_by` text NOT NULL,
	`requested_at` text NOT NULL,
	`responded_by` text,
	`responded_at` text
);
