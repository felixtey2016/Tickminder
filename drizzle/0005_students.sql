CREATE TABLE `students` (
	`name` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `students` (`name`, `created_at`)
SELECT DISTINCT `student`, CURRENT_TIMESTAMP FROM `plans` WHERE TRIM(`student`) <> '';
--> statement-breakpoint
INSERT OR IGNORE INTO `students` (`name`, `created_at`)
SELECT DISTINCT `student`, CURRENT_TIMESTAMP FROM `lessons` WHERE TRIM(`student`) <> '';
--> statement-breakpoint
INSERT OR IGNORE INTO `students` (`name`, `created_at`)
SELECT DISTINCT `student_name`, CURRENT_TIMESTAMP FROM `accounts` WHERE `student_name` IS NOT NULL AND TRIM(`student_name`) <> '';
