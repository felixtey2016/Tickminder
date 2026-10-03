CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lock_until` text,
	`next_attempt_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_unique` ON `notification_deliveries` (`item_id`,`subscription_id`);--> statement-breakpoint
CREATE INDEX `notification_delivery_due_idx` ON `notification_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `notification_items` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`planned_start` text NOT NULL,
	`offset_minutes` integer NOT NULL,
	`due_at` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_item_unique` ON `notification_items` (`account_id`,`lesson_id`,`planned_start`,`offset_minutes`);--> statement-breakpoint
CREATE INDEX `notification_account_idx` ON `notification_items` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_runtime` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_dispatch_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`language` text DEFAULT 'zh' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_test_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_account_idx` ON `push_subscriptions` (`account_id`);