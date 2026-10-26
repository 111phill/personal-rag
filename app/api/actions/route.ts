import { getDb } from '@/db';
import { dailyActions, mutateAction } from '@/db/action-store';
import { ActionError, validCommand } from '@/lib/actions';
import { isDate, localDate } from '@/lib/daily-note';

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date') ?? localDate();
  if (!isDate(date))
    return Response.json({ error: '日期无效' }, { status: 400 });
  try {
    return Response.json(await dailyActions(getDb(), date), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: '行动读取失败，请确认已备份并执行 db:init' },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  if (!validCommand(input))
    return Response.json({ error: '行动请求格式无效' }, { status: 400 });
  try {
    return Response.json(await mutateAction(getDb(), input));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ActionError
            ? error.message
            : '保存失败，请保留页面后重试',
      },
      { status: error instanceof ActionError ? error.status : 500 },
    );
  }
}
export const PATCH = POST;
