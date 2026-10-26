CREATE TABLE `action_events` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`action_version` integer NOT NULL,
	`changed_at` text NOT NULL,
	`change_type` text NOT NULL,
	`status_before` text,
	`status_after` text NOT NULL,
	`scheduled_date_before` text,
	`scheduled_date_after` text,
	`completed_at_before` text,
	`completed_at_after` text,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_events_request_id_unique` ON `action_events` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_action_event_version` ON `action_events` (`action_id`,`action_version`);--> statement-breakpoint
CREATE INDEX `idx_action_events_time` ON `action_events` (`action_id`,`changed_at`,`action_version`);--> statement-breakpoint
CREATE TABLE `action_migration_map` (
	`migration_version` text NOT NULL,
	`note_id` integer NOT NULL,
	`list_type` text NOT NULL,
	`legacy_key` text NOT NULL,
	`action_id` text NOT NULL,
	PRIMARY KEY(`migration_version`, `note_id`, `list_type`, `legacy_key`),
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `action_migration_notes` (
	`migration_version` text NOT NULL,
	`note_id` integer NOT NULL,
	`original_content` text NOT NULL,
	`content_hash` text NOT NULL,
	`imported` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`migration_version`, `note_id`)
);
--> statement-breakpoint
CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`source_date` text NOT NULL,
	`scheduled_date` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	`goal_id` text,
	`version` integer NOT NULL,
	CONSTRAINT "actions_status" CHECK("actions"."status" IN ('pending','today','completed','deferred','abandoned')),
	CONSTRAINT "actions_pending_date" CHECK("actions"."status" != 'pending' OR "actions"."scheduled_date" IS NULL),
	CONSTRAINT "actions_planned_date" CHECK("actions"."status" NOT IN ('today','deferred') OR "actions"."scheduled_date" IS NOT NULL),
	CONSTRAINT "actions_completed_time" CHECK("actions"."status" = 'completed' OR "actions"."completed_at" IS NULL)
);
--> statement-breakpoint
CREATE INDEX `idx_actions_schedule` ON `actions` (`status`,`scheduled_date`,`source_date`);--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`week_start` text PRIMARY KEY NOT NULL,
	`gains` text NOT NULL,
	`blockers` text NOT NULL,
	`next_focus` text NOT NULL,
	`snapshot` text NOT NULL,
	`generated_at` text NOT NULL,
	`version` integer NOT NULL
);
