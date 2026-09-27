ALTER TABLE `accounts` ADD `name_confirmed_at` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `online_link` text;--> statement-breakpoint
UPDATE `accounts` SET `name_confirmed_at` = `created_at` WHERE `name_confirmed_at` IS NULL;
