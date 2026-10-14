CREATE TABLE `inbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`archived_to` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_status_created_at` ON `inbox_items` (`status`,`created_at`);