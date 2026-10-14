import { getDb } from '@/db';
import { archiveDailyNote } from '@/db/note-store';
import { localDate } from '@/lib/daily-note';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET() {
  const db = getDb();
  const result = await db
    .prepare(
      `SELECT id, content, status, archived_to AS archivedTo, created_at AS createdAt, updated_at AS updatedAt
     FROM inbox_items
     WHERE status = 'pending'
     ORDER BY created_at DESC`,
    )
    .all();
  return Response.json({ items: result.results });
}

export async function POST(request: Request) {
  const db = getDb();
  const input = asRecord(await request.json().catch(() => null));
  const content =
    typeof input?.content === 'string' ? input.content.trim() : '';
  if (!content || content.length > 10_000) {
    return Response.json(
      { error: '收集内容不能为空且不能超过 10000 字' },
      { status: 400 },
    );
  }

  const item = {
    id: crypto.randomUUID(),
    content,
    status: 'pending',
    archivedTo: null,
    createdAt: new Date().toISOString(),
  };
  await db
    .prepare(
      `INSERT INTO inbox_items (id, content, status, archived_to, created_at, updated_at)
     VALUES (?, ?, 'pending', NULL, ?, ?)`,
    )
    .bind(item.id, item.content, item.createdAt, item.createdAt)
    .run();
  return Response.json({ item }, { status: 201 });
}

export async function PATCH(request: Request) {
  const db = getDb();
  const input = asRecord(await request.json().catch(() => null));
  const id = typeof input?.id === 'string' ? input.id : '';
  const operation = typeof input?.operation === 'string' ? input.operation : '';
  const timestamp = new Date().toISOString();
  if (!id) return Response.json({ error: '缺少记录编号' }, { status: 400 });

  if (operation === 'update') {
    const content =
      typeof input?.content === 'string' ? input.content.trim() : '';
    if (!content || content.length > 10_000) {
      return Response.json(
        { error: '收集内容不能为空且不能超过 10000 字' },
        { status: 400 },
      );
    }
    const result = await db
      .prepare(
        `UPDATE inbox_items SET content = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
      )
      .bind(content, timestamp, id)
      .run();
    if (result.meta.changes !== 1)
      return Response.json(
        { error: '记录已处理，请刷新后重试' },
        { status: 409 },
      );
    return Response.json({ updated: true });
  }

  if (operation === 'archive') {
    const target = input?.target;
    if (
      target !== 'today' &&
      target !== 'today-thoughts' &&
      target !== 'work' &&
      target !== 'learning' &&
      target !== 'insights'
    ) {
      return Response.json({ error: '归档目标无效' }, { status: 400 });
    }
    const inboxItem = await db
      .prepare(
        `SELECT id, content, status, updated_at AS updatedAt FROM inbox_items WHERE id = ? AND status = 'pending'`,
      )
      .bind(id)
      .first<{
        id: string;
        content: string;
        status: string;
        updatedAt: string;
      }>();
    const content =
      typeof inboxItem?.content === 'string' ? inboxItem.content : '';
    if (!inboxItem || !content)
      return Response.json(
        { error: '收集内容不存在或已处理' },
        { status: 404 },
      );

    const archiveStatement = db
      .prepare(
        `UPDATE inbox_items SET status = 'archived', archived_to = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND changes() = 1`,
      )
      .bind(target, timestamp, id);

    if (target === 'today' || target === 'today-thoughts') {
      const archived = await archiveDailyNote(
        db,
        'inbox',
        inboxItem,
        localDate(),
        target === 'today-thoughts' ? 'thought' : 'body',
      );
      if (!archived)
        return Response.json(
          { error: '笔记已更新，请重试归档' },
          { status: 409 },
        );
    } else {
      const title =
        content
          .split(/\r?\n/)
          .find((line) => line.trim())
          ?.trim()
          .slice(0, 120) ?? '未命名记录';
      const saveKnowledgeStatement = db
        .prepare(
          `INSERT INTO knowledge_items (id, kind, title, content, status, source_inbox_id, created_at, updated_at)
         SELECT ?, ?, ?, ?, 'active', ?, ?, ? WHERE EXISTS (SELECT 1 FROM inbox_items WHERE id = ? AND status = 'pending' AND updated_at = ?)`,
        )
        .bind(
          crypto.randomUUID(),
          target,
          title,
          content,
          id,
          timestamp,
          timestamp,
          id,
          inboxItem.updatedAt,
        );
      const results = await db.batch([
        saveKnowledgeStatement,
        archiveStatement,
      ]);
      if (results[0].meta.changes !== 1)
        return Response.json(
          { error: '收集内容已变化，请刷新后重试' },
          { status: 409 },
        );
    }
    return Response.json({ archived: true });
  }

  if (operation === 'delete') {
    await db
      .prepare(
        `UPDATE inbox_items SET status = 'deleted', updated_at = ? WHERE id = ? AND status = 'pending'`,
      )
      .bind(timestamp, id)
      .run();
    return Response.json({ deleted: true });
  }

  return Response.json({ error: '操作无效' }, { status: 400 });
}
