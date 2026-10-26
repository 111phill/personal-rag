import {
  readableDaily,
  type AgentSource,
  type SourceReference,
} from '../lib/agent-context.ts';
import { readActions } from './action-store.ts';
import { actionMarkdown } from '../lib/actions.ts';

export type AgentConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};
export type AgentMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceReference[];
  createdAt: string;
};

export async function readAgentSources(db: D1Database): Promise<AgentSource[]> {
  const [daily, knowledge, inbox] = await Promise.all([
    db
      .prepare(
        "SELECT date, title, content, updated_at AS updatedAt FROM notes WHERE category = 'daily'",
      )
      .all<{
        date: string;
        title: string;
        content: string;
        updatedAt: string;
      }>(),
    db
      .prepare(
        "SELECT id, kind, title, content, updated_at AS updatedAt FROM knowledge_items WHERE status != 'deleted' AND NOT (kind = 'insights' AND status = 'completed')",
      )
      .all<{
        id: string;
        kind: string;
        title: string;
        content: string;
        updatedAt: string;
      }>(),
    db
      .prepare(
        "SELECT id, content, created_at AS createdAt, updated_at AS updatedAt FROM inbox_items WHERE status = 'pending'",
      )
      .all<{
        id: string;
        content: string;
        createdAt: string;
        updatedAt: string;
      }>(),
  ]);
  const result: AgentSource[] = [];
  const actions = await readActions(db);
  for (const item of daily.results) {
    const actionText = actionMarkdown(
      actions.filter((a) => a.sourceDate === item.date),
    );
    const content = [readableDaily(item.content).trim(), actionText]
      .filter(Boolean)
      .join('\n\n');
    if (content)
      result.push({
        id: `daily:${item.date}`,
        kind: 'daily',
        targetId: item.date,
        title: item.title || item.date,
        date: item.date,
        content,
        updatedAt: item.updatedAt,
      });
  }
  for (const date of new Set(actions.map((a) => a.sourceDate))) {
    if (!daily.results.some((n) => n.date === date))
      result.push({
        id: `daily:${date}`,
        kind: 'daily',
        targetId: date,
        title: date,
        date,
        content: actionMarkdown(actions.filter((a) => a.sourceDate === date)),
        updatedAt: actions.filter((a) => a.sourceDate === date).at(-1)!
          .createdAt,
      });
  }
  for (const item of knowledge.results) {
    if (
      item.kind !== 'work' &&
      item.kind !== 'learning' &&
      item.kind !== 'insights'
    )
      continue;
    const content = `${item.title}\n${item.content}`.trim();
    if (content)
      result.push({
        id: `knowledge:${item.id}`,
        kind: item.kind,
        targetId: item.id,
        title: item.title,
        date: item.updatedAt.slice(0, 10),
        content,
        updatedAt: item.updatedAt,
      });
  }
  for (const item of inbox.results) {
    const content = item.content.trim();
    if (content)
      result.push({
        id: `inbox:${item.id}`,
        kind: 'inbox',
        targetId: item.id,
        title: content.slice(0, 28),
        date: item.createdAt.slice(0, 10),
        content,
        updatedAt: item.updatedAt,
      });
  }
  return result;
}

export async function listConversations(
  db: D1Database,
): Promise<AgentConversation[]> {
  const result = await db
    .prepare(
      'SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM agent_conversations ORDER BY updated_at DESC',
    )
    .all<AgentConversation>();
  return result.results;
}

export async function createConversation(
  db: D1Database,
): Promise<AgentConversation> {
  const now = new Date().toISOString();
  const conversation = {
    id: crypto.randomUUID(),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
  };
  await db
    .prepare(
      'INSERT INTO agent_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    )
    .bind(conversation.id, conversation.title, now, now)
    .run();
  return conversation;
}

export async function getConversation(
  db: D1Database,
  id: string,
): Promise<AgentConversation | null> {
  return db
    .prepare(
      'SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM agent_conversations WHERE id = ?',
    )
    .bind(id)
    .first<AgentConversation>();
}

export async function listMessages(
  db: D1Database,
  conversationId: string,
): Promise<AgentMessage[]> {
  const result = await db
    .prepare(
      'SELECT id, conversation_id AS conversationId, role, content, sources, created_at AS createdAt FROM agent_messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC',
    )
    .bind(conversationId)
    .all<Omit<AgentMessage, 'sources'> & { sources: string }>();
  return result.results.reverse().map((item) => ({
    ...item,
    role: item.role === 'assistant' ? 'assistant' : 'user',
    sources: JSON.parse(item.sources) as SourceReference[],
  }));
}

export async function saveExchange(
  db: D1Database,
  conversation: AgentConversation,
  question: string,
  answer: string,
  sources: SourceReference[],
): Promise<AgentMessage[]> {
  const now = new Date().toISOString();
  const messages: AgentMessage[] = [
    {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role: 'user',
      content: question,
      sources: [],
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role: 'assistant',
      content: answer,
      sources,
      createdAt: now,
    },
  ];
  const title =
    conversation.title === '新对话'
      ? question.slice(0, 36)
      : conversation.title;
  await db.batch([
    ...messages.map((message) =>
      db
        .prepare(
          'INSERT INTO agent_messages (id, conversation_id, role, content, sources, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          message.id,
          conversation.id,
          message.role,
          message.content,
          JSON.stringify(message.sources),
          now,
        ),
    ),
    db
      .prepare(
        'UPDATE agent_conversations SET title = ?, updated_at = ? WHERE id = ?',
      )
      .bind(title, now, conversation.id),
  ]);
  return messages;
}
