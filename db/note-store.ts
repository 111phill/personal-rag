import { appendToNote, displayDate } from '../lib/daily-note.ts';
import type { NoteRecord } from '../lib/daily-note.ts';

export async function readNote(db: D1Database, date: string) {
  return db
    .prepare(
      "SELECT date, title, content, updated_at AS updatedAt FROM notes WHERE date = ? AND category = 'daily'",
    )
    .bind(date)
    .first<NoteRecord>();
}

// 所有写入都以读取时的版本为条件；更新失败绝不覆盖较新的内容。
export function noteWrite(
  db: D1Database,
  date: string,
  content: string,
  expectedVersion: string | null,
  guard = '1',
  guardValues: unknown[] = [],
) {
  const timestamp = new Date(
    Math.max(Date.now(), Date.parse(expectedVersion ?? '') + 1 || 0),
  ).toISOString();
  const statement = db
    .prepare(`
    INSERT INTO notes (date, title, content, category, created_at, updated_at)
    SELECT ?, ?, ?, 'daily', ?, ? WHERE ${guard}
      AND (? IS NULL OR EXISTS (SELECT 1 FROM notes WHERE date = ? AND category = 'daily'))
    ON CONFLICT(date, category) DO UPDATE SET
      title = excluded.title, content = excluded.content, updated_at = excluded.updated_at
    WHERE notes.updated_at = ?
  `)
    .bind(
      date,
      displayDate(date),
      content,
      timestamp,
      timestamp,
      ...guardValues,
      expectedVersion,
      date,
      expectedVersion,
    );
  return { statement, timestamp };
}

export async function saveDailyNote(
  db: D1Database,
  date: string,
  content: string,
  expectedVersion: string | null,
) {
  const { statement, timestamp } = noteWrite(
    db,
    date,
    content,
    expectedVersion,
  );
  const result = await statement.run();
  return result.meta.changes === 1 ? timestamp : null;
}

type ArchiveSource = {
  id: string;
  content: string;
  title?: string;
  status: string;
  updatedAt: string;
};
export async function archiveDailyNote(
  db: D1Database,
  source: 'inbox' | 'thought',
  item: ArchiveSource,
  date: string,
  section: 'body' | 'thought',
) {
  const current = await readNote(db, date);
  const addition =
    source === 'thought'
      ? `### ${item.title ?? '未命名思考'}${item.content ? '\n' + item.content : ''}`
      : item.content;
  const content = appendToNote(current?.content ?? '', section, addition);
  if (content.length > 100_000)
    throw new Error('当天笔记已超过长度上限，请分开保存');
  const table = source === 'thought' ? 'knowledge_items' : 'inbox_items';
  const { statement, timestamp } = noteWrite(
    db,
    date,
    content,
    current?.updatedAt ?? null,
    `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND status = ? AND updated_at = ? AND content = ?)`,
    [item.id, item.status, item.updatedAt, item.content],
  );
  const target = section === 'thought' ? 'today-thoughts' : 'today';
  const finish =
    source === 'thought'
      ? db
          .prepare(
            "UPDATE knowledge_items SET status = 'completed', updated_at = ? WHERE id = ? AND changes() = 1",
          )
          .bind(timestamp, item.id)
      : db
          .prepare(
            "UPDATE inbox_items SET status = 'archived', archived_to = ?, updated_at = ? WHERE id = ? AND changes() = 1",
          )
          .bind(target, timestamp, item.id);
  const statements = [statement, finish];
  if (source === 'inbox')
    statements.push(
      db
        .prepare(`
    INSERT INTO knowledge_items (id, kind, title, content, status, source_inbox_id, created_at, updated_at)
    SELECT ?, ?, ?, ?, 'archived', ?, ?, ? WHERE changes() = 1
  `)
        .bind(
          `inbox-${item.id}`,
          target,
          displayDate(date),
          item.content,
          item.id,
          timestamp,
          timestamp,
        ),
    );
  const results = await db.batch(statements);
  return results[0].meta.changes === 1;
}
