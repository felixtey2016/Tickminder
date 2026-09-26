CREATE TABLE `local_credentials` (
	`account_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_credentials_username_unique` ON `local_credentials` (`username`);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`username` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`window_start` text NOT NULL,
	`blocked_until` text
);
