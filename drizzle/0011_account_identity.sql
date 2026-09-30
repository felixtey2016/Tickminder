CREATE TABLE `google_identities` (
	`subject` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`email` text NOT NULL,
	`linked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_identities_account_id_unique` ON `google_identities` (`account_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `disabled_at` text;
--> statement-breakpoint
INSERT INTO google_identities (subject, account_id, email, linked_at)
SELECT id, id, email, created_at FROM accounts WHERE id NOT LIKE 'local:%' AND email <> '';
