import {
  ActionError,
  addDays,
  carryoverGroup,
  cutoffFor,
  dateAt,
  projectActions,
} from '../lib/actions.ts';
import type {
  Action,
  ActionCommand,
  ActionEvent,
  DailyActions,
} from '../lib/actions.ts';
import { isDate } from '../lib/daily-note.ts';

const actionColumns = `id, content, status, source_date AS sourceDate, scheduled_date AS scheduledDate,
 created_at AS createdAt, completed_at AS completedAt, goal_id AS goalId, version`;
const eventColumns = `id, action_id AS actionId, action_version AS actionVersion, changed_at AS changedAt,
 change_type AS changeType, status_before AS statusBefore, status_after AS statusAfter,
 scheduled_date_before AS scheduledDateBefore, scheduled_date_after AS scheduledDateAfter,
 completed_at_before AS completedAtBefore, completed_at_after AS completedAtAfter,
 request_id AS requestId, request_hash AS requestHash`;

export async function hashValue(value: unknown) {
  const encoded = JSON.stringify(value, (_key, part: unknown) =>
    part && typeof part === 'object' && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part).sort(([a], [b]) => a.localeCompare(b)),
        )
      : part,
  );
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(encoded),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function readActions(db: D1Database) {
  return (
    await db
      .prepare(`SELECT ${actionColumns} FROM actions ORDER BY created_at, id`)
      .all<Action>()
  ).results;
}
export async function readEvents(db: D1Database) {
  return (
    await db
      .prepare(
        `SELECT ${eventColumns} FROM action_events ORDER BY changed_at, action_version`,
      )
      .all<ActionEvent>()
  ).results;
}
export async function readActionTimeline(db: D1Database) {
  const [actions, events] = await db.batch<Action | ActionEvent>([
    db.prepare(`SELECT ${actionColumns} FROM actions ORDER BY created_at, id`),
    db.prepare(
      `SELECT ${eventColumns} FROM action_events ORDER BY changed_at, action_version`,
    ),
  ]);
  return {
    actions: actions.results as Action[],
    events: events.results as ActionEvent[],
  };
}
export function eventStatement(
  db: D1Database,
  e: ActionEvent,
  guarded = false,
) {
  return db
    .prepare(`INSERT INTO action_events
   (id,action_id,action_version,changed_at,change_type,status_before,status_after,
    scheduled_date_before,scheduled_date_after,completed_at_before,completed_at_after,request_id,request_hash)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? ${guarded ? 'WHERE changes() = 1' : ''}`)
    .bind(
      e.id,
      e.actionId,
      e.actionVersion,
      e.changedAt,
      e.changeType,
      e.statusBefore,
      e.statusAfter,
      e.scheduledDateBefore,
      e.scheduledDateAfter,
      e.completedAtBefore,
      e.completedAtAfter,
      e.requestId,
      e.requestHash,
    );
}
export function insertAction(db: D1Database, a: Action) {
  return db
    .prepare(`INSERT INTO actions(id,content,status,source_date,scheduled_date,created_at,completed_at,goal_id,version)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(
      a.id,
      a.content,
      a.status,
      a.sourceDate,
      a.scheduledDate,
      a.createdAt,
      a.completedAt,
      a.goalId,
      a.version,
    );
}
export async function dailyActions(
  db: D1Database,
  date: string,
  now = new Date().toISOString(),
): Promise<DailyActions> {
  const { actions, events } = await readActionTimeline(db);
  const today = dateAt(now);
  const cutoff = cutoffFor(date, now);
  const projected = projectActions(actions, events, cutoff);
  const involved = new Set(
    events
      .filter(
        (e) =>
          e.changedAt < cutoff &&
          dateAt(e.changedAt) === date &&
          e.changeType !== 'edit',
      )
      .map((e) => e.actionId),
  );
  const items = projected.filter(
    (a) =>
      a.sourceDate === date || a.scheduledDate === date || involved.has(a.id),
  );
  // Imported records have no trustworthy state timeline before their import.
  for (const action of actions) {
    if (
      action.sourceDate === date &&
      !items.some((a) => a.id === action.id) &&
      events.some((e) => e.actionId === action.id && e.changeType === 'import')
    ) {
      items.push({ ...action, status: 'unknown', completedAt: null });
    }
  }
  const carryover =
    date === today
      ? actions
          .filter((a) => carryoverGroup(a, date))
          .sort(
            (a, b) =>
              carryoverGroup(a, date) - carryoverGroup(b, date) ||
              a.sourceDate.localeCompare(b.sourceDate),
          )
      : [];
  const future =
    date === today
      ? actions
          .filter((a) => a.status === 'deferred' && a.scheduledDate! > date)
          .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))
      : [];
  // Future pages show only explicit arrangements, never projected future states.
  if (date > today)
    return {
      today,
      date,
      items: actions.filter(
        (a) => a.status === 'deferred' && a.scheduledDate === date,
      ),
      carryover: [],
      future: [],
    };
  return {
    today,
    date,
    items,
    carryover: [...new Map(carryover.map((a) => [a.id, a])).values()],
    future,
  };
}
export async function mutateAction(
  db: D1Database,
  c: ActionCommand,
  now = new Date().toISOString(),
) {
  const requestHash = await hashValue(c);
  const replay = async () => {
    const old = await db
      .prepare(
        `SELECT action_id AS actionId, action_version AS version, request_hash AS hash FROM action_events WHERE request_id = ?`,
      )
      .bind(c.requestId)
      .first<{ actionId: string; version: number; hash: string }>();
    if (!old) return null;
    if (old.hash !== requestHash)
      throw new ActionError('同一请求编号不能用于不同操作', 409);
    return { id: old.actionId, version: old.version };
  };
  const previousResult = await replay();
  if (previousResult) return previousResult;
  const today = dateAt(now);
  if (c.viewDate !== today)
    throw new ActionError('行动只能在今天处理，请刷新日期后重试', 409);
  let before: Action | null = null;
  let after: Action;
  if (c.operation === 'create') {
    if (!['pending', 'today', 'tomorrow'].includes(c.schedule ?? ''))
      throw new ActionError('安排方式无效');
    const content = c.content?.trim();
    if (!content || content.length > 4000)
      throw new ActionError('行动内容须为 1 至 4000 字');
    after = {
      id: crypto.randomUUID(),
      content,
      status: c.schedule === 'tomorrow' ? 'deferred' : c.schedule!,
      sourceDate: today,
      scheduledDate:
        c.schedule === 'pending'
          ? null
          : c.schedule === 'today'
            ? today
            : addDays(today, 1),
      createdAt: now,
      completedAt: null,
      goalId: null,
      version: 1,
    };
  } else {
    before = await db
      .prepare(`SELECT ${actionColumns} FROM actions WHERE id = ?`)
      .bind(c.id!)
      .first<Action>();
    if (!before) throw new ActionError('行动不存在', 404);
    if (before.version !== c.expectedVersion)
      throw new ActionError(
        '行动已被其他页面修改，草稿已保留，请重新读取',
        409,
      );
    after = { ...before, version: before.version + 1 };
    const open = ['pending', 'today', 'deferred'].includes(before.status);
    if (
      ['include', 'defer', 'complete', 'abandon'].includes(c.operation) &&
      !open
    )
      throw new ActionError('当前状态不支持此操作', 409);
    switch (c.operation) {
      case 'include':
        after.status = 'today';
        after.scheduledDate = today;
        break;
      case 'defer':
        if (!isDate(c.scheduledDate) || c.scheduledDate <= today)
          throw new ActionError('请选择明天或未来的日期');
        after.status = 'deferred';
        after.scheduledDate = c.scheduledDate;
        break;
      case 'complete':
        after.status = 'completed';
        after.completedAt = now;
        break;
      case 'abandon':
        after.status = 'abandoned';
        break;
      case 'undo': {
        if (before.status !== 'completed')
          throw new ActionError('只有完成的行动可以撤销完成', 409);
        const completion = await db
          .prepare(
            `SELECT ${eventColumns} FROM action_events WHERE action_id = ? AND change_type = 'complete' ORDER BY action_version DESC LIMIT 1`,
          )
          .bind(before.id)
          .first<ActionEvent>();
        after.status = completion?.statusBefore ?? 'pending';
        after.scheduledDate = completion?.scheduledDateBefore ?? null;
        after.completedAt = null;
        break;
      }
      case 'edit':
        if (!c.content?.trim() || c.content.trim().length > 4000)
          throw new ActionError('行动内容须为 1 至 4000 字');
        after.content = c.content.trim();
        break;
    }
  }
  const event: ActionEvent = {
    id: crypto.randomUUID(),
    actionId: after.id,
    actionVersion: after.version,
    changedAt: now,
    changeType: c.operation,
    statusBefore: before?.status ?? null,
    statusAfter: after.status,
    scheduledDateBefore: before?.scheduledDate ?? null,
    scheduledDateAfter: after.scheduledDate,
    completedAtBefore: before?.completedAt ?? null,
    completedAtAfter: after.completedAt,
    requestId: c.requestId,
    requestHash,
  };
  const write = before
    ? db
        .prepare(
          `UPDATE actions SET content=?,status=?,scheduled_date=?,completed_at=?,version=? WHERE id=? AND version=?`,
        )
        .bind(
          after.content,
          after.status,
          after.scheduledDate,
          after.completedAt,
          after.version,
          after.id,
          before.version,
        )
    : insertAction(db, after);
  try {
    const results = await db.batch([write, eventStatement(db, event, true)]);
    if (results[0].meta.changes !== 1) {
      const retry = await replay();
      if (retry) return retry;
      throw new ActionError('行动已更新，请重新读取', 409);
    }
  } catch (error) {
    const retry = await replay();
    if (retry) return retry;
    throw error;
  }
  return { id: after.id, version: after.version };
}
