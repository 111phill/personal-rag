CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'daily' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notes_date_category` ON `notes` (`date`,`category`);--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at` ON `notes` (`updated_at`);