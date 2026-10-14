CREATE TABLE `knowledge_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_inbox_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_kind_status_updated` ON `knowledge_items` (`kind`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_knowledge_source_inbox` ON `knowledge_items` (`source_inbox_id`);