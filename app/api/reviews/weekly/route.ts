import { getDb } from '@/db';
import { readReview, saveReview } from '@/db/review-store';
import { ActionError, weekStart } from '@/lib/actions';
import { isDate, localDate } from '@/lib/daily-note';

export async function GET(request: Request) {
  const start =
    new URL(request.url).searchParams.get('weekStart') ??
    weekStart(localDate());
  if (
    !isDate(start) ||
    weekStart(start) !== start ||
    start > weekStart(localDate())
  )
    return Response.json({ error: '周日期无效' }, { status: 400 });
  try {
    return Response.json(await readReview(getDb(), start), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: '复盘读取失败，请确认已备份并执行 db:init' },
      { status: 503 },
    );
  }
}
export async function PUT(request: Request) {
  const i = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (
    !i ||
    !isDate(i.weekStart) ||
    !['gains', 'blockers', 'nextFocus'].every(
      (k) => typeof i[k] === 'string' && (i[k] as string).length <= 10000,
    ) ||
    !(
      i.expectedVersion === null ||
      (Number.isSafeInteger(i.expectedVersion) &&
        (i.expectedVersion as number) > 0)
    ) ||
    (i.refreshSummary !== undefined && typeof i.refreshSummary !== 'boolean')
  )
    return Response.json({ error: '复盘格式无效' }, { status: 400 });
  try {
    return Response.json(
      await saveReview(getDb(), i as Parameters<typeof saveReview>[1]),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ActionError
            ? error.message
            : '保存失败，草稿已保留，请重试',
      },
      { status: error instanceof ActionError ? error.status : 500 },
    );
  }
}
