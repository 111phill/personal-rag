import { isDate, localDate } from './daily-note.ts';

export const actionStatuses = [
  'pending',
  'today',
  'completed',
  'deferred',
  'abandoned',
] as const;
export type ActionStatus = (typeof actionStatuses)[number];
export type Action = {
  id: string;
  content: string;
  status: ActionStatus;
  sourceDate: string;
  scheduledDate: string | null;
  createdAt: string;
  completedAt: string | null;
  goalId: string | null;
  version: number;
};
export type ActionEvent = {
  id: string;
  actionId: string;
  actionVersion: number;
  changedAt: string;
  changeType:
    | 'create'
    | 'import'
    | 'include'
    | 'defer'
    | 'complete'
    | 'undo'
    | 'abandon'
    | 'edit';
  statusBefore: ActionStatus | null;
  statusAfter: ActionStatus;
  scheduledDateBefore: string | null;
  scheduledDateAfter: string | null;
  completedAtBefore: string | null;
  completedAtAfter: string | null;
  requestId: string;
  requestHash: string;
};
export type ProjectedAction = Omit<Action, 'status'> & {
  status: ActionStatus | 'unknown';
};
export type DailyActions = {
  today: string;
  date: string;
  items: ProjectedAction[];
  carryover: Action[];
  future: Action[];
};
export type ActionCommand = {
  requestId: string;
  viewDate: string;
  operation: ActionEvent['changeType'];
  id?: string;
  expectedVersion?: number;
  content?: string;
  schedule?: 'pending' | 'today' | 'tomorrow';
  scheduledDate?: string;
};
export const statusLabels = {
  pending: '待办',
  today: '今日',
  completed: '完成',
  deferred: '延期',
  abandoned: '放弃',
  unknown: '历史状态未知',
};
export function dateAt(now: string) {
  return localDate(new Date(now));
}
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dayStart(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}
export function cutoffFor(date: string, now: string) {
  return date < dateAt(now)
    ? dayStart(addDays(date, 1))
    : new Date(Date.parse(now) + 1).toISOString();
}
export function weekStart(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -(day + 6) % 7);
}
export function carryoverGroup(action: ProjectedAction, date: string) {
  if (
    action.status === 'today' &&
    action.scheduledDate &&
    action.scheduledDate < date
  )
    return 1;
  if (action.status === 'pending' && action.sourceDate < date) return 2;
  if (
    action.status === 'deferred' &&
    action.scheduledDate &&
    action.scheduledDate <= date
  )
    return 3;
  return 0;
}
export function projectActions(
  actions: Action[],
  events: ActionEvent[],
  cutoff: string,
): ProjectedAction[] {
  const latest = new Map<string, ActionEvent>();
  for (const event of events) {
    if (event.changedAt >= cutoff) continue;
    const old = latest.get(event.actionId);
    if (
      !old ||
      event.changedAt > old.changedAt ||
      (event.changedAt === old.changedAt &&
        event.actionVersion > old.actionVersion)
    )
      latest.set(event.actionId, event);
  }
  return actions.flatMap((action) => {
    const event = latest.get(action.id);
    if (!event) return [];
    return [
      {
        ...action,
        status: event.statusAfter,
        scheduledDate: event.scheduledDateAfter,
        completedAt: event.completedAtAfter,
      },
    ];
  });
}
export class ActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function actionMarkdown(items: ProjectedAction[]) {
  return items
    .map(
      (a) =>
        `- [${a.status === 'completed' ? 'x' : ' '}] ${a.content.replace(/\n/g, ' ')}（${statusLabels[a.status]}；来源 ${a.sourceDate}${a.scheduledDate ? `；安排 ${a.scheduledDate}` : ''}）`,
    )
    .join('\n');
}
export function validCommand(input: unknown): input is ActionCommand {
  if (!input || typeof input !== 'object') return false;
  const c = input as ActionCommand;
  if (
    (c.operation === 'create' || c.operation === 'edit') &&
    typeof c.content !== 'string'
  )
    return false;
  return (
    typeof c.requestId === 'string' &&
    /^[\w-]{1,100}$/.test(c.requestId) &&
    isDate(c.viewDate) &&
    [
      'create',
      'include',
      'defer',
      'complete',
      'undo',
      'abandon',
      'edit',
    ].includes(c.operation) &&
    (c.operation === 'create' ||
      (typeof c.id === 'string' &&
        Number.isSafeInteger(c.expectedVersion) &&
        c.expectedVersion! > 0))
  );
}
