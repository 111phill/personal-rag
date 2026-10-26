import {
  ActionError,
  addDays,
  carryoverGroup,
  dateAt,
  dayStart,
  projectActions,
  weekStart,
} from '../lib/actions.ts';
import { parseNote } from '../lib/daily-note.ts';
import { readActionTimeline } from './action-store.ts';
import type {
  WeekSnapshot,
  WeeklyReview,
  ReviewSource,
} from '../lib/weekly-review.ts';

export async function generateWeek(
  db: D1Database,
  start: string,
  now = new Date().toISOString(),
): Promise<WeekSnapshot> {
  const end = addDays(start, 6);
  const boundary = dayStart(addDays(start, 7));
  const cutoff =
    boundary <= now ? boundary : new Date(Date.parse(now) + 1).toISOString();
  const from = dayStart(start);
  const timeline = await readActionTimeline(db);
  const events = timeline.events;
  const involved = new Set(
    events
      .filter(
        (e) =>
          e.changedAt >= from &&
          e.changedAt < cutoff &&
          !['edit', 'import'].includes(e.changeType),
      )
      .map((e) => e.actionId),
  );
  const undone = new Set(
    events
      .filter(
        (e) =>
          e.changedAt >= from &&
          e.changedAt < cutoff &&
          e.changeType === 'undo',
      )
      .map((e) => e.actionId),
  );
  const asOf = end < dateAt(now) ? end : dateAt(now);
  const actions = projectActions(timeline.actions, events, cutoff)
    .filter((a) => involved.has(a.id) || carryoverGroup(a, asOf) > 0)
    .map((a) => ({ ...a, undoneThisWeek: undone.has(a.id) }));
  const notes = await db
    .prepare(
      "SELECT date,title,content FROM notes WHERE category='daily' AND date>=? AND date<=? ORDER BY date",
    )
    .bind(start, asOf)
    .all<{ date: string; title: string; content: string }>();
  const sources: ReviewSource[] = notes.results.flatMap((n) => {
    const body = parseNote(n.content).body.trim();
    return body
      ? [
          {
            id: n.date,
            kind: 'daily' as const,
            date: n.date,
            title: n.title,
            excerpt: Array.from(body).slice(0, 200).join(''),
          },
        ]
      : [];
  });
  const library = await db
    .prepare(`SELECT id,kind,title,content,created_at AS createdAt,updated_at AS updatedAt FROM knowledge_items
    WHERE kind IN ('work','learning') AND status!='deleted' AND ((created_at>=? AND created_at<?) OR (updated_at>=? AND updated_at<?)) ORDER BY updated_at,id`)
    .bind(from, cutoff, from, cutoff)
    .all<{
      id: string;
      kind: 'work' | 'learning';
      title: string;
      content: string;
      createdAt: string;
      updatedAt: string;
    }>();
  for (const n of library.results)
    sources.push({
      id: n.id,
      kind: n.kind,
      date: dateAt(n.updatedAt < cutoff ? n.updatedAt : n.createdAt),
      title: n.title,
      excerpt: Array.from(n.content.trim()).slice(0, 200).join(''),
    });
  return { weekStart: start, weekEnd: end, generatedAt: now, actions, sources };
}
export async function readReview(
  db: D1Database,
  start: string,
  now = new Date().toISOString(),
): Promise<WeeklyReview> {
  const saved = await db
    .prepare(
      'SELECT week_start AS weekStart,gains,blockers,next_focus AS nextFocus,snapshot,version FROM weekly_reviews WHERE week_start=?',
    )
    .bind(start)
    .first<{
      weekStart: string;
      gains: string;
      blockers: string;
      nextFocus: string;
      snapshot: string;
      version: number;
    }>();
  if (saved)
    return { ...saved, snapshot: JSON.parse(saved.snapshot) as WeekSnapshot };
  return {
    weekStart: start,
    gains: '',
    blockers: '',
    nextFocus: '',
    version: null,
    snapshot: await generateWeek(db, start, now),
  };
}
export async function saveReview(
  db: D1Database,
  input: {
    weekStart: string;
    gains: string;
    blockers: string;
    nextFocus: string;
    expectedVersion: number | null;
    refreshSummary?: boolean;
  },
  now = new Date().toISOString(),
) {
  if (
    weekStart(input.weekStart) !== input.weekStart ||
    input.weekStart > weekStart(dateAt(now))
  )
    throw new ActionError('请选择本周或过去的完整周');
  const old = await readReview(db, input.weekStart, now);
  if (old.version !== input.expectedVersion)
    throw new ActionError('复盘已被其他页面修改，草稿已保留，请重新读取', 409);
  const snapshot =
    old.version === null || input.refreshSummary
      ? await generateWeek(db, input.weekStart, now)
      : old.snapshot;
  const version = (old.version ?? 0) + 1;
  const result =
    old.version === null
      ? await db
          .prepare(
            'INSERT INTO weekly_reviews(week_start,gains,blockers,next_focus,snapshot,generated_at,version) VALUES(?,?,?,?,?,?,?) ON CONFLICT(week_start) DO NOTHING',
          )
          .bind(
            input.weekStart,
            input.gains,
            input.blockers,
            input.nextFocus,
            JSON.stringify(snapshot),
            snapshot.generatedAt,
            version,
          )
          .run()
      : await db
          .prepare(
            'UPDATE weekly_reviews SET gains=?,blockers=?,next_focus=?,snapshot=?,generated_at=?,version=? WHERE week_start=? AND version=?',
          )
          .bind(
            input.gains,
            input.blockers,
            input.nextFocus,
            JSON.stringify(snapshot),
            snapshot.generatedAt,
            version,
            input.weekStart,
            old.version,
          )
          .run();
  if (result.meta.changes !== 1)
    throw new ActionError('复盘已更新，请重新读取', 409);
  return {
    ...old,
    gains: input.gains,
    blockers: input.blockers,
    nextFocus: input.nextFocus,
    snapshot,
    version,
  };
}
