import { getDb } from '@/db';
import { MigrationRequired, readNote, saveDailyNote } from '@/db/note-store';
import { isDate, isDailyNote, serializeNote } from '@/lib/daily-note';

export async function GET(request: Request) {
  const db = getDb();
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (date) {
    if (!isDate(date))
      return Response.json({ error: '日期无效' }, { status: 400 });
    return Response.json(
      { note: await readNote(db, date) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const query = url.searchParams.get('q')?.trim() ?? '';
  const result = await db
    .prepare(`
    SELECT date, title FROM notes
    WHERE category = 'daily' AND (? = '' OR title LIKE ? OR content LIKE ?)
    ORDER BY date DESC
  `)
    .bind(query, `%${query}%`, `%${query}%`)
    .all();
  return Response.json(
    { notes: result.results },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== 'object')
    return Response.json({ error: '笔记格式无效' }, { status: 400 });
  const { date, note, expectedVersion } = input as Record<string, unknown>;
  if (
    !isDate(date) ||
    !isDailyNote(note) ||
    !(expectedVersion === null || typeof expectedVersion === 'string')
  ) {
    return Response.json(
      { error: '笔记格式无效，请刷新旧版页面后重试' },
      { status: 400 },
    );
  }
  const content = serializeNote(note);
  if (content.length > 100_000)
    return Response.json({ error: '笔记超过长度上限' }, { status: 400 });
  let version: string | null;
  try {
    version = await saveDailyNote(getDb(), date, content, expectedVersion);
  } catch (error) {
    if (error instanceof MigrationRequired)
      return Response.json({ error: error.message }, { status: 503 });
    throw error;
  }
  if (!version)
    return Response.json(
      {
        error:
          '这天的笔记已被其他页面或归档更新。当前草稿已保留，请读取最新版本后合并。',
      },
      { status: 409 },
    );
  return Response.json({ saved: true, updatedAt: version });
}
