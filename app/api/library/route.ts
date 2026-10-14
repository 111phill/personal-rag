import { getDb } from '@/db';
import { archiveDailyNote } from '@/db/note-store';
import { localDate } from '@/lib/daily-note';

const kinds = ['work', 'learning', 'insights'] as const;
const statuses = ['active', 'paused', 'completed'] as const;
type Kind = (typeof kinds)[number];
type Status = (typeof statuses)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function isKind(value: unknown): value is Kind {
  return typeof value === 'string' && kinds.includes(value as Kind);
}

function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && statuses.includes(value as Status);
}

export async function GET(request: Request) {
  const db = getDb();
  const kind = new URL(request.url).searchParams.get('kind');
  if (!isKind(kind))
    return Response.json({ error: '内容类型无效' }, { status: 400 });
  const result = await db
    .prepare(
      `SELECT id, kind, title, content, status, source_inbox_id AS sourceInboxId,
            created_at AS createdAt, updated_at AS updatedAt
     FROM knowledge_items
     WHERE kind = ? AND status != 'deleted'
       AND NOT (kind = 'insights' AND status = 'completed')
     ORDER BY updated_at DESC`,
    )
    .bind(kind)
    .all();
  return Response.json({ items: result.results });
}

export async function POST(request: Request) {
  const db = getDb();
  const input = asRecord(await request.json().catch(() => null));
  const kind = input?.kind;
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const content =
    typeof input?.content === 'string' ? input.content.trim() : '';
  const status = isStatus(input?.status) ? input.status : 'active';
  if (kind === 'insights' && status === 'completed')
    return Response.json({ error: '请使用归入今日操作' }, { status: 400 });
  if (
    !isKind(kind) ||
    !title ||
    title.length > 120 ||
    content.length > 100_000
  ) {
    return Response.json({ error: '内容格式无效' }, { status: 400 });
  }
  const timestamp = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    kind,
    title,
    content,
    status,
    sourceInboxId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db
    .prepare(
      `INSERT INTO knowledge_items (id, kind, title, content, status, source_inbox_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      item.id,
      item.kind,
      item.title,
      item.content,
      item.status,
      timestamp,
      timestamp,
    )
    .run();
  return Response.json({ item }, { status: 201 });
}

export async function PATCH(request: Request) {
  const db = getDb();
  const input = asRecord(await request.json().catch(() => null));
  const id = typeof input?.id === 'string' ? input.id : '';
  const operation = input?.operation;
  if (!id) return Response.json({ error: '缺少记录编号' }, { status: 400 });

  if (operation === 'archive-today') {
    const item = await db
      .prepare(
        `SELECT id, title, content, status, updated_at AS updatedAt FROM knowledge_items WHERE id = ? AND kind = 'insights' AND status != 'deleted'`,
      )
      .bind(id)
      .first<{
        id: string;
        title: string;
        content: string;
        status: string;
        updatedAt: string;
      }>();
    if (!item || item.status === 'completed') {
      return Response.json(
        { error: '这条思考不存在或已经归入今日' },
        { status: 409 },
      );
    }
    const archived = await archiveDailyNote(
      db,
      'thought',
      item,
      localDate(),
      'thought',
    );
    if (!archived)
      return Response.json(
        { error: '内容刚刚发生变化，请刷新后重试归档' },
        { status: 409 },
      );
    return Response.json({ archivedToday: true });
  }

  if (operation === 'delete') {
    await db
      .prepare(
        'UPDATE knowledge_items SET status = ?, updated_at = ? WHERE id = ?',
      )
      .bind('deleted', new Date().toISOString(), id)
      .run();
    return Response.json({ deleted: true });
  }

  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const content =
    typeof input?.content === 'string' ? input.content.trim() : '';
  const status = input?.status;
  if (
    operation !== 'update' ||
    !title ||
    title.length > 120 ||
    content.length > 100_000 ||
    !isStatus(status)
  ) {
    return Response.json({ error: '更新内容格式无效' }, { status: 400 });
  }
  if (status === 'completed') {
    const existing = await db
      .prepare('SELECT kind FROM knowledge_items WHERE id = ?')
      .bind(id)
      .first<{ kind: string }>();
    if (existing?.kind === 'insights')
      return Response.json({ error: '请使用归入今日操作' }, { status: 400 });
  }
  const result = await db
    .prepare(
      `UPDATE knowledge_items SET title = ?, content = ?, status = ?, updated_at = ?
     WHERE id = ? AND status != 'deleted' AND NOT (kind = 'insights' AND status = 'completed')`,
    )
    .bind(title, content, status, new Date().toISOString(), id)
    .run();
  if (result.meta.changes !== 1)
    return Response.json(
      { error: '记录已删除或归档，请刷新后重试' },
      { status: 409 },
    );
  return Response.json({ updated: true });
}
