import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const notes = sqliteTable(
  'notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    category: text('category').notNull().default('daily'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_notes_date_category').on(table.date, table.category),
    index('idx_notes_updated_at').on(table.updatedAt),
  ],
);

export const inboxItems = sqliteTable(
  'inbox_items',
  {
    id: text('id').primaryKey(),
    content: text('content').notNull(),
    status: text('status').notNull().default('pending'),
    archivedTo: text('archived_to'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_inbox_status_created_at').on(table.status, table.createdAt),
  ],
);

export const knowledgeItems = sqliteTable(
  'knowledge_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    status: text('status').notNull().default('active'),
    sourceInboxId: text('source_inbox_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_knowledge_kind_status_updated').on(
      table.kind,
      table.status,
      table.updatedAt,
    ),
    uniqueIndex('idx_knowledge_source_inbox').on(table.sourceInboxId),
  ],
);

export const agentConversations = sqliteTable('agent_conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const agentMessages = sqliteTable(
  'agent_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => agentConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    sources: text('sources').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_agent_messages_conversation_created').on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const actions = sqliteTable(
  'actions',
  {
    id: text('id').primaryKey(),
    content: text('content').notNull(),
    status: text('status').notNull(),
    sourceDate: text('source_date').notNull(),
    scheduledDate: text('scheduled_date'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
    goalId: text('goal_id'),
    version: integer('version').notNull(),
  },
  (table) => [
    index('idx_actions_schedule').on(
      table.status,
      table.scheduledDate,
      table.sourceDate,
    ),
    check(
      'actions_status',
      sql`${table.status} IN ('pending','today','completed','deferred','abandoned')`,
    ),
    check(
      'actions_pending_date',
      sql`${table.status} != 'pending' OR ${table.scheduledDate} IS NULL`,
    ),
    check(
      'actions_planned_date',
      sql`${table.status} NOT IN ('today','deferred') OR ${table.scheduledDate} IS NOT NULL`,
    ),
    check(
      'actions_completed_time',
      sql`${table.status} = 'completed' OR ${table.completedAt} IS NULL`,
    ),
  ],
);

export const actionEvents = sqliteTable(
  'action_events',
  {
    id: text('id').primaryKey(),
    actionId: text('action_id')
      .notNull()
      .references(() => actions.id),
    actionVersion: integer('action_version').notNull(),
    changedAt: text('changed_at').notNull(),
    changeType: text('change_type').notNull(),
    statusBefore: text('status_before'),
    statusAfter: text('status_after').notNull(),
    scheduledDateBefore: text('scheduled_date_before'),
    scheduledDateAfter: text('scheduled_date_after'),
    completedAtBefore: text('completed_at_before'),
    completedAtAfter: text('completed_at_after'),
    requestId: text('request_id').notNull().unique(),
    requestHash: text('request_hash').notNull(),
  },
  (table) => [
    uniqueIndex('idx_action_event_version').on(
      table.actionId,
      table.actionVersion,
    ),
    index('idx_action_events_time').on(
      table.actionId,
      table.changedAt,
      table.actionVersion,
    ),
  ],
);

export const actionMigrationNotes = sqliteTable(
  'action_migration_notes',
  {
    migrationVersion: text('migration_version').notNull(),
    noteId: integer('note_id').notNull(),
    originalContent: text('original_content').notNull(),
    contentHash: text('content_hash').notNull(),
    imported: integer('imported').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.migrationVersion, table.noteId] })],
);

export const actionMigrationMap = sqliteTable(
  'action_migration_map',
  {
    migrationVersion: text('migration_version').notNull(),
    noteId: integer('note_id').notNull(),
    listType: text('list_type').notNull(),
    legacyKey: text('legacy_key').notNull(),
    actionId: text('action_id')
      .notNull()
      .references(() => actions.id),
  },
  (table) => [
    primaryKey({
      columns: [
        table.migrationVersion,
        table.noteId,
        table.listType,
        table.legacyKey,
      ],
    }),
  ],
);

export const weeklyReviews = sqliteTable('weekly_reviews', {
  weekStart: text('week_start').primaryKey(),
  gains: text('gains').notNull(),
  blockers: text('blockers').notNull(),
  nextFocus: text('next_focus').notNull(),
  snapshot: text('snapshot').notNull(),
  generatedAt: text('generated_at').notNull(),
  version: integer('version').notNull(),
});
