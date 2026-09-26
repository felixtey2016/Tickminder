ALTER TABLE `homework` ADD `max_score` real;--> statement-breakpoint
ALTER TABLE `homework_recipients` ADD `score` real;--> statement-breakpoint
ALTER TABLE `homework_recipients` ADD `scored_at` text;--> statement-breakpoint
ALTER TABLE `homework_recipients` ADD `scored_by` text;