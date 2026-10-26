import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { localRuntime, migrate } from '../scripts/database-local.mjs';
import {
  dailyActions,
  mutateAction,
  readActions,
  readEvents,
} from '../db/action-store.ts';
import { generateWeek, readReview, saveReview } from '../db/review-store.ts';
import { migrateActions } from '../db/migrate-actions.ts';
import {
  archiveDailyNote,
  MigrationRequired,
  readNote,
  saveDailyNote,
} from '../db/note-store.ts';
import {
  addDays,
  dateAt,
  dayStart,
  projectActions,
  validCommand,
  weekStart,
} from '../lib/actions.ts';
import type { ActionCommand } from '../lib/actions.ts';
import { serializeNote } from '../lib/daily-note.ts';
import { weeklyMarkdown } from '../lib/weekly-review.ts';

const runtime = localRuntime(false);
after(() => runtime.dispose());
async function database() {
  const db = (await runtime.getD1Database('DB')) as unknown as D1Database;
  await migrate(db);
  await db.batch(
    [
      'action_events',
      'action_migration_map',
      'action_migration_notes',
      'actions',
      'weekly_reviews',
      'notes',
      'knowledge_items',
    ].map((t) => db.prepare(`DELETE FROM ${t}`)),
  );
  return db;
}
const monday = '2026-10-19T04:00:00.000Z';
const tuesday = '2026-10-20T04:00:00.000Z';
const wednesday = '2026-10-21T04:00:00.000Z';
const sunday = '2026-10-25T12:00:00.000Z';
function command(
  c: Omit<ActionCommand, 'requestId' | 'viewDate'>,
  now = monday,
): ActionCommand {
  return { requestId: crypto.randomUUID(), viewDate: dateAt(now), ...c };
}
async function create(
  db: D1Database,
  schedule: 'today' | 'tomorrow' | 'pending' = 'today',
  now = monday,
  content = '完成接口验证',
) {
  return mutateAction(
    db,
    command({ operation: 'create', schedule, content }, now),
    now,
  );
}
async function change(
  db: D1Database,
  id: string,
  operation: ActionCommand['operation'],
  now = monday,
  extra: Partial<ActionCommand> = {},
) {
  const a = (await readActions(db)).find((a) => a.id === id)!;
  return mutateAction(
    db,
    command({ id, operation, expectedVersion: a.version, ...extra }, now),
    now,
  );
}
async function legacy(db: D1Database, content: string, date = '2026-10-19') {
  await db
    .prepare(
      "INSERT INTO notes(date,title,content,category,created_at,updated_at) VALUES(?,?,?,'daily',?,?)",
    )
    .bind(date, date, content, monday, monday)
    .run();
}

void test('state machine: tomorrow is deferred, arrival is read-only, undo restores the previous arrangement', async () => {
  const db = await database();
  const { id } = await create(db, 'tomorrow');
  let a = (await readActions(db))[0];
  assert.equal(a.status, 'deferred');
  assert.equal(a.scheduledDate, '2026-10-20');
  assert.equal(
    (await dailyActions(db, '2026-10-19', monday)).carryover.length,
    0,
  );
  assert.equal(
    (await dailyActions(db, '2026-10-20', tuesday)).carryover.length,
    1,
  );
  assert.equal((await readEvents(db)).length, 1);
  await change(db, id, 'include', tuesday);
  await change(db, id, 'complete', tuesday);
  await change(db, id, 'undo', wednesday);
  a = (await readActions(db))[0];
  assert.equal(a.status, 'today');
  assert.equal(a.scheduledDate, '2026-10-20');
  assert.equal(a.completedAt, null);
  assert.equal(
    (await dailyActions(db, '2026-10-21', wednesday)).carryover[0].id,
    id,
  );
  await change(db, id, 'defer', wednesday, { scheduledDate: '2026-10-23' });
  assert.equal(
    (await dailyActions(db, '2026-10-21', wednesday)).future.length,
    1,
  );
  await change(db, id, 'abandon', wednesday);
  assert.equal(
    (await dailyActions(db, '2026-10-21', wednesday)).carryover.length,
    0,
  );
  assert.equal((await readActions(db))[0].sourceDate, '2026-10-19');
});
void test('carryover groups are exclusive, ordered and deduplicated by action identity', async () => {
  const db = await database();
  const a = await create(db, 'pending');
  const b = await create(db, 'tomorrow');
  const c = await create(db, 'today');
  const result = await dailyActions(db, '2026-10-20', tuesday);
  assert.deepEqual(
    result.carryover.map((a) => a.id),
    [c.id, a.id, b.id],
  );
  assert.equal(new Set(result.carryover.map((a) => a.id)).size, 3);
  await change(db, a.id, 'include', tuesday);
  assert.equal(
    (await dailyActions(db, '2026-10-20', tuesday)).carryover.length,
    2,
  );
});
void test('completion undo restores every open status, while content edits preserve its arrangement', async () => {
  const db = await database();
  for (const schedule of ['pending', 'today', 'tomorrow'] as const) {
    const { id } = await create(db, schedule);
    const before = (await readActions(db)).find((a) => a.id === id)!;
    await change(db, id, 'complete', tuesday);
    await change(db, id, 'edit', tuesday, { content: '完成后修改内容' });
    await change(db, id, 'undo', wednesday);
    const after = (await readActions(db)).find((a) => a.id === id)!;
    assert.equal(after.status, before.status);
    assert.equal(after.scheduledDate, before.scheduledDate);
    assert.equal(after.sourceDate, before.sourceDate);
    assert.equal(after.completedAt, null);
    assert.equal(after.content, '完成后修改内容');
    await change(db, id, 'abandon', wednesday);
    await assert.rejects(change(db, id, 'complete', wednesday), /不支持/);
    await assert.rejects(change(db, id, 'undo', wednesday), /只有完成/);
  }
});
void test('requests are idempotent including concurrent creates and canonical property order', async () => {
  const db = await database();
  const c = command({
    operation: 'create',
    schedule: 'pending',
    content: '唯一行动',
  });
  const results = await Promise.all([
    mutateAction(db, c, monday),
    mutateAction(db, c, monday),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(
    await mutateAction(
      db,
      Object.fromEntries(Object.entries(c).reverse()) as ActionCommand,
      tuesday,
    ),
    results[0],
  );
  assert.equal((await readActions(db)).length, 1);
  assert.equal((await readEvents(db)).length, 1);
  await assert.rejects(
    mutateAction(db, { ...c, content: '换了内容' }, monday),
    /不同操作/,
  );
});
void test('invalid transitions, stale versions, backdated writes and invalid scheduled dates are rejected', async () => {
  const db = await database();
  const a = await create(db);
  await assert.rejects(
    mutateAction(
      db,
      command({ id: a.id, operation: 'include', expectedVersion: 99 }),
      monday,
    ),
    /其他页面/,
  );
  await assert.rejects(
    mutateAction(
      db,
      command({ id: a.id, operation: 'include', expectedVersion: 1 }, monday),
      tuesday,
    ),
    /今天处理/,
  );
  for (const scheduledDate of ['2026-10-19', '2026-02-30', 'invalid'])
    await assert.rejects(
      change(db, a.id, 'defer', monday, { scheduledDate }),
      /未来/,
    );
  await change(db, a.id, 'complete');
  await assert.rejects(change(db, a.id, 'include'), /不支持/);
  assert.equal(
    validCommand({
      operation: 'complete',
      requestId: 'x',
      viewDate: '2026-10-19',
      id: a.id,
      expectedVersion: -1,
    }),
    false,
  );
});
void test('state and event append roll back together when the event insert fails', async () => {
  const db = await database();
  await db
    .prepare(
      "CREATE TRIGGER fail_event BEFORE INSERT ON action_events BEGIN SELECT RAISE(ABORT,'event failed'); END",
    )
    .run();
  try {
    await assert.rejects(create(db), /event failed/);
    assert.equal((await readActions(db)).length, 0);
  } finally {
    await db.prepare('DROP TRIGGER fail_event').run();
  }
});
void test('daily history uses end-of-day states, current content, and version ordering within a millisecond', async () => {
  const db = await database();
  const { id } = await create(db);
  await change(db, id, 'complete', tuesday);
  await change(db, id, 'undo', wednesday);
  await change(db, id, 'edit', wednesday, { content: '修改后的内容' });
  const old = await dailyActions(db, '2026-10-20', wednesday);
  assert.equal(old.items[0].status, 'completed');
  assert.equal(old.items[0].content, '修改后的内容');
  const events = await readEvents(db);
  const projected = projectActions(
    await readActions(db),
    events,
    dayStart('2026-10-22'),
  );
  assert.equal(projected[0].status, 'today');
  assert.equal(projected[0].scheduledDate, '2026-10-19');
  assert.equal(
    (await dailyActions(db, '2026-10-21', wednesday)).carryover.length,
    1,
  );
});
void test('Shanghai midnight excludes next-day events but includes the last millisecond', async () => {
  const db = await database();
  const { id } = await create(db, 'today', '2026-10-19T15:59:59.999Z');
  await change(db, id, 'complete', '2026-10-19T16:00:00.000Z');
  assert.equal(
    (await dailyActions(db, '2026-10-19', tuesday)).items[0].status,
    'today',
  );
  assert.equal(
    (await dailyActions(db, '2026-10-20', tuesday)).items[0].status,
    'completed',
  );
  assert.equal(weekStart('2026-10-25'), '2026-10-19');
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
void test('weekly groups use final state once and preserve undo marker across later content edits', async () => {
  const db = await database();
  const { id } = await create(db);
  await change(db, id, 'complete', tuesday);
  await change(db, id, 'undo', wednesday);
  let snapshot = await generateWeek(db, '2026-10-19', sunday);
  assert.equal(snapshot.actions.length, 1);
  assert.equal(snapshot.actions[0].status, 'today');
  assert.equal(snapshot.actions[0].undoneThisWeek, true);
  await change(db, id, 'complete', '2026-10-26T04:00:00.000Z');
  snapshot = await generateWeek(db, '2026-10-19', '2026-10-27T04:00:00.000Z');
  assert.equal(snapshot.actions[0].status, 'today');
});
void test('weekly snapshot is fixed, explicit refresh keeps narratives, exports match and stale saves conflict', async () => {
  const db = await database();
  await create(db);
  await legacy(
    db,
    serializeNote({ body: '正文摘要', thought: '思考不作为工作摘要' }),
  );
  await db
    .prepare(
      "INSERT INTO knowledge_items(id,kind,title,content,status,created_at,updated_at) VALUES('learning','learning','学习记录',?,'active',?,?)",
    )
    .bind('学'.repeat(250), monday, monday)
    .run();
  const input = {
    weekStart: '2026-10-19',
    gains: '收获',
    blockers: '阻塞',
    nextFocus: '重点',
    expectedVersion: null,
  };
  const first = await saveReview(db, input, tuesday);
  assert.equal(first.snapshot.sources.length, 2);
  assert.equal(first.snapshot.sources[1].excerpt.length, 200);
  await db
    .prepare('UPDATE notes SET content=?')
    .bind(serializeNote({ body: '后来修改', thought: '' }))
    .run();
  const second = await saveReview(
    db,
    { ...input, gains: '新收获', expectedVersion: 1 },
    wednesday,
  );
  assert.equal(second.snapshot.sources[0].excerpt, '正文摘要');
  const refreshed = await saveReview(
    db,
    { ...input, gains: '新收获', expectedVersion: 2, refreshSummary: true },
    wednesday,
  );
  assert.equal(refreshed.snapshot.sources[0].excerpt, '后来修改');
  assert.equal(refreshed.gains, '新收获');
  assert.ok(weeklyMarkdown(refreshed).includes('后来修改'));
  assert.ok(weeklyMarkdown(refreshed).includes('新收获'));
  assert.deepEqual(await readReview(db, '2026-10-19', sunday), refreshed);
  await assert.rejects(
    saveReview(db, { ...input, expectedVersion: 1 }, wednesday),
    /其他页面/,
  );
});
void test('migration keeps separate identical items, stable identity, blank rows and truthful unknown history', async () => {
  const db = await database();
  const note = {
    goals: [
      { id: 'stable', text: '相同内容', completed: false },
      { id: 'second', text: '相同内容', completed: true },
      { id: 'blank', text: ' ', completed: false },
    ],
    actions: [{ id: 'tomorrow', text: '明日事项', completed: false }],
    body: '正文',
    thought: '',
  };
  await legacy(db, JSON.stringify({ format: 'daily-note-v1', note }));
  await migrateActions(db, tuesday);
  const before = await readActions(db);
  assert.equal(before.length, 3);
  assert.equal(
    before.find((a) => a.content === '明日事项')!.scheduledDate,
    '2026-10-20',
  );
  assert.equal(before.find((a) => a.status === 'completed')!.completedAt, null);
  const history = await dailyActions(db, '2026-10-19', wednesday);
  assert.ok(history.items.every((a) => a.status === 'unknown'));
  const week = await generateWeek(db, '2026-10-19', wednesday);
  assert.ok(!week.actions.some((a) => a.status === 'completed'));
  await migrateActions(db, wednesday);
  assert.deepEqual(await readActions(db), before);
  note.goals.unshift({ id: 'inserted', text: '新插入', completed: false });
  await db
    .prepare('UPDATE notes SET content=?')
    .bind(JSON.stringify({ format: 'daily-note-v1', note }))
    .run();
  assert.equal((await migrateActions(db, wednesday)).length, 1);
  assert.deepEqual(await readActions(db), before);
  const imported = before.find((a) => a.status === 'completed')!;
  await change(db, imported.id, 'undo', wednesday);
  assert.equal(
    (await readActions(db)).find((a) => a.id === imported.id)!.status,
    'pending',
  );
});
void test('legacy checklists cannot be overwritten by saving or archiving before explicit import', async () => {
  const db = await database();
  const content =
    '## 今日目标\n- [ ] 原行动\n\n## 工作与学习\n正文\n\n## 思考\n\n## 明日行动\n- [ ] 明日';
  await legacy(db, content);
  const current = (await readNote(db, '2026-10-19'))!;
  const item = {
    id: 'guarded',
    title: '思考',
    content: '保留来源',
    status: 'active',
    updatedAt: monday,
  };
  await db
    .prepare(
      "INSERT INTO knowledge_items(id,kind,title,content,status,created_at,updated_at) VALUES(?,'insights',?,?,?, ?,?)",
    )
    .bind(item.id, item.title, item.content, item.status, monday, monday)
    .run();
  await assert.rejects(
    saveDailyNote(
      db,
      current.date,
      serializeNote({ body: '新版正文', thought: '' }),
      current.updatedAt,
    ),
    MigrationRequired,
  );
  await assert.rejects(
    archiveDailyNote(db, 'thought', item, current.date, 'thought'),
    MigrationRequired,
  );
  assert.equal((await readNote(db, current.date))!.content, content);
  assert.equal(
    await db
      .prepare('SELECT status FROM knowledge_items WHERE id=?')
      .bind(item.id)
      .first('status'),
    'active',
  );
  await migrateActions(db, tuesday);
  assert.ok(
    await saveDailyNote(
      db,
      current.date,
      serializeNote({ body: '新版正文', thought: '' }),
      current.updatedAt,
    ),
  );
  assert.equal(
    await archiveDailyNote(db, 'thought', item, current.date, 'thought'),
    true,
  );
  assert.equal((await readActions(db)).length, 2);
});
void test('migration uses unique original IDs and frozen positions for duplicate or empty IDs', async () => {
  const db = await database();
  await legacy(
    db,
    JSON.stringify(
      {
        note: {
          body: '',
          thought: '',
          actions: [],
          goals: [
            { id: 'stable', text: '一', completed: false },
            { id: 'duplicate', text: '二', completed: false },
            { id: 'duplicate', text: '三', completed: false },
            { id: '', text: '四', completed: false },
            { text: '五', completed: false },
          ],
        },
        format: 'daily-note-v1',
      },
      null,
      2,
    ),
  );
  await migrateActions(db, tuesday);
  const keys = await db
    .prepare(
      'SELECT legacy_key AS key FROM action_migration_map ORDER BY legacy_key',
    )
    .all<{ key: string }>();
  assert.deepEqual(
    keys.results.map((r) => r.key),
    ['id:stable', 'position:1', 'position:2', 'position:3', 'position:4'],
  );
  await migrateActions(db, wednesday);
  assert.equal((await readActions(db)).length, 5);
});
void test('Markdown migration retries from the frozen snapshot after a transaction rollback', async () => {
  const db = await database();
  await legacy(
    db,
    '## 今日目标\n- [ ] 相同\n- [ ] 相同\n\n## 工作与学习\n原文\n\n## 思考\n\n## 明日行动\n- [ ] 明日',
  );
  await db
    .prepare(
      "CREATE TRIGGER fail_map BEFORE INSERT ON action_migration_map BEGIN SELECT RAISE(ABORT,'mapping failed'); END",
    )
    .run();
  await assert.rejects(migrateActions(db, tuesday), /mapping failed/);
  assert.equal((await readActions(db)).length, 0);
  await db.prepare('DROP TRIGGER fail_map').run();
  await db.prepare("UPDATE notes SET content='后来插入的文本'").run();
  assert.equal((await migrateActions(db, wednesday)).length, 1);
  const actions = await readActions(db);
  assert.equal(actions.length, 3);
  assert.equal(actions.filter((a) => a.content === '相同').length, 2);
  await migrateActions(db, wednesday);
  assert.equal((await readActions(db)).length, 3);
});
