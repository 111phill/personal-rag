import { archiveDailyNote } from './note-store.ts';

// 旧版遗留修复从 GET 中移出，只在备份后由用户显式执行。
export async function repairArchives(db: D1Database) {
  const { results } = await db
    .prepare(`
    SELECT i.id, i.content, i.status, i.archived_to AS target, i.updated_at AS updatedAt
    FROM inbox_items i LEFT JOIN knowledge_items k ON k.source_inbox_id = i.id
    WHERE i.status = 'archived' AND k.id IS NULL
  `)
    .all<{
      id: string;
      content: string;
      status: string;
      target: string;
      updatedAt: string;
    }>();
  let repaired = 0;
  for (const item of results) {
    if (item.target === 'today' || item.target === 'today-thoughts') {
      const date = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai',
      }).format(new Date(item.updatedAt));
      if (
        await archiveDailyNote(
          db,
          'inbox',
          item,
          date,
          item.target === 'today' ? 'body' : 'thought',
        )
      )
        repaired++;
    } else if (['work', 'learning', 'insights'].includes(item.target)) {
      const result = await db
        .prepare(`
        INSERT OR IGNORE INTO knowledge_items (id, kind, title, content, status, source_inbox_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `)
        .bind(
          `inbox-${item.id}`,
          item.target,
          item.content.split(/\r?\n/)[0].slice(0, 120) || '未命名记录',
          item.content,
          item.id,
          item.updatedAt,
          item.updatedAt,
        )
        .run();
      repaired += result.meta.changes;
    }
  }
  return repaired;
}
