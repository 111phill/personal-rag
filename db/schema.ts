import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  (table) => [index('idx_inbox_status_created_at').on(table.status, table.createdAt)],
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
    index('idx_knowledge_kind_status_updated').on(table.kind, table.status, table.updatedAt),
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
  (table) => [index('idx_agent_messages_conversation_created').on(table.conversationId, table.createdAt)],
);
