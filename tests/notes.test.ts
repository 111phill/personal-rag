import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { localRuntime, migrate } from '../scripts/database-local.mjs';
import { archiveDailyNote, readNote, saveDailyNote } from '../db/note-store.ts';
import {
  emptyNote,
  markdownNote,
  parseNote,
  parseLegacyNote,
  isDailyNote,
  serializeNote,
} from '../lib/daily-note.ts';
import type { DailyNote, NoteRecord } from '../lib/daily-note.ts';
import { NoteSession, SaveConflict } from '../lib/note-session.ts';
import type { Draft, NoteTransport } from '../lib/note-session.ts';

const runtime = localRuntime(false);
after(() => runtime.dispose());
async function database() {
  const db = (await runtime.getD1Database('DB')) as unknown as D1Database;
  await migrate(db);
  return db;
}
function record(date: string, body = '', version = 'v1'): NoteRecord {
  return {
    date,
    title: date,
    content: serializeNote({ ...emptyNote(), body }),
    updatedAt: version,
  };
}
function memoryDrafts() {
  const entries = new Map<string, Draft>();
  return {
    entries,
    read: (date: string) => entries.get(date) ?? null,
    write: (date: string, draft: Draft) => {
      entries.set(date, draft);
    },
    remove: (date: string) => {
      entries.delete(date);
    },
  };
}

void test('v2 preserves body text, rejects legacy writes and keeps legacy checklists readable for migration', () => {
  const note = {
    goals: [{ id: 'g', text: '目标', completed: true }],
    body: '正文\n## 思考\n这是正文标题\n  ',
    thought: '思考\n## 明日行动\n保留原文',
    actions: [{ id: 'a', text: '', completed: false }],
  };
  assert.deepEqual(parseNote(serializeNote(note)), {
    body: note.body,
    thought: note.thought,
  });
  assert.equal(isDailyNote(note), false);
  assert.deepEqual(
    parseLegacyNote(JSON.stringify({ format: 'daily-note-v1', note })),
    note,
  );
  const legacy = parseLegacyNote(
    '## 今日目标\n- [x] 目标\n\n## 工作与学习\n正文\n\n## 思考\n想法\n\n## 明日行动\n- [ ] 行动',
  );
  assert.equal(legacy.body, '正文');
  assert.equal(legacy.thought, '想法');
  assert.equal(legacy.goals[0].completed, true);
  assert.equal(legacy.actions[0].text, '行动');
  assert.ok(markdownNote(note).includes('正文标题'));
});

void test('database version checks reject stale writes, duplicate creates and missing expected records', async () => {
  const db = await database();
  const date = '2090-01-01';
  const v1 = await saveDailyNote(db, date, record(date, 'first').content, null);
  assert.ok(v1);
  const v2 = await saveDailyNote(db, date, record(date, 'second').content, v1);
  assert.ok(v2);
  assert.notEqual(v2, v1);
  assert.equal(await saveDailyNote(db, date, 'stale', v1), null);
  assert.equal(await saveDailyNote(db, date, 'duplicate', null), null);
  assert.equal(await saveDailyNote(db, '2090-01-02', 'missing', v1), null);
  assert.equal(parseNote((await readNote(db, date))!.content).body, 'second');
  await migrate(db);
  assert.equal((await readNote(db, date))!.updatedAt, v2);
});

void test('thought archive preserves existing sections, hides source only on success and blocks stale editor', async () => {
  const db = await database();
  const date = '2090-02-01';
  const version = await saveDailyNote(
    db,
    date,
    serializeNote({ ...emptyNote(), body: '工作', thought: '原有想法' }),
    null,
  );
  const item = {
    id: 'thought-1',
    title: '新想法',
    content: '内容',
    status: 'active',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  await db
    .prepare(
      "INSERT INTO knowledge_items (id, kind, title, content, status, created_at, updated_at) VALUES (?, 'insights', ?, ?, ?, ?, ?)",
    )
    .bind(
      item.id,
      item.title,
      item.content,
      item.status,
      item.updatedAt,
      item.updatedAt,
    )
    .run();
  assert.equal(
    await archiveDailyNote(db, 'thought', item, date, 'thought'),
    true,
  );
  const saved = parseNote((await readNote(db, date))!.content);
  assert.equal(saved.body, '工作');
  assert.equal(saved.thought, '原有想法\n\n### 新想法\n内容');
  assert.equal(
    await archiveDailyNote(db, 'thought', item, date, 'thought'),
    false,
  );
  assert.equal(await saveDailyNote(db, date, 'stale', version), null);
  assert.equal(
    await db
      .prepare('SELECT status FROM knowledge_items WHERE id = ?')
      .bind(item.id)
      .first('status'),
    'completed',
  );
});

void test('archive loses a version race without hiding source or overwriting the new daily note', async () => {
  const db = await database();
  const date = '2090-03-01';
  const version = await saveDailyNote(
    db,
    date,
    record(date, 'before').content,
    null,
  );
  const item = {
    id: 'inbox-1',
    content: '收集内容',
    status: 'pending',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  await db
    .prepare(
      "INSERT INTO inbox_items (id, content, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)",
    )
    .bind(item.id, item.content, item.updatedAt, item.updatedAt)
    .run();
  const racing = Object.create(db) as D1Database;
  racing.prepare = db.prepare.bind(db);
  racing.batch = async <T>(statements: D1PreparedStatement[]) => {
    await saveDailyNote(db, date, record(date, 'newer edit').content, version);
    return db.batch<T>(statements);
  };
  assert.equal(
    await archiveDailyNote(racing, 'inbox', item, date, 'body'),
    false,
  );
  assert.equal(
    await db
      .prepare('SELECT status FROM inbox_items WHERE id = ?')
      .bind(item.id)
      .first('status'),
    'pending',
  );
  assert.equal(
    parseNote((await readNote(db, date))!.content).body,
    'newer edit',
  );
  assert.equal(await archiveDailyNote(db, 'inbox', item, date, 'body'), true);
  assert.equal(await archiveDailyNote(db, 'inbox', item, date, 'body'), false);
  assert.equal(
    parseNote((await readNote(db, date))!.content).body,
    'newer edit\n\n收集内容',
  );
});

void test('archive batch rolls back note and source if inserting the archive marker fails', async () => {
  const db = await database();
  const date = '2090-04-01';
  const item = {
    id: 'rollback',
    content: 'preserve me',
    status: 'pending',
    updatedAt: 'v1',
  };
  await db
    .prepare(
      "INSERT INTO inbox_items (id, content, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)",
    )
    .bind(item.id, item.content, item.updatedAt, item.updatedAt)
    .run();
  await db
    .prepare(
      "INSERT INTO knowledge_items (id, kind, title, content, status, source_inbox_id, created_at, updated_at) VALUES ('existing-marker', 'work', 'existing', '', 'active', ?, '', '')",
    )
    .bind(item.id)
    .run();
  await assert.rejects(archiveDailyNote(db, 'inbox', item, date, 'body'));
  assert.equal(await readNote(db, date), null);
  assert.equal(
    await db
      .prepare('SELECT status FROM inbox_items WHERE id = ?')
      .bind(item.id)
      .first('status'),
    'pending',
  );
});

void test('autosave serializes requests and saves edits made while the first request is pending', async () => {
  const drafts = memoryDrafts();
  const writes: { note: DailyNote; version: string | null }[] = [];
  let release: (version: string) => void = () => {};
  const session = new NoteSession(
    '2090-05-01',
    {
      read: async (date) => record(date),
      write: async (_date, note, version) => {
        writes.push({ note, version });
        if (writes.length === 1)
          return new Promise<string>((resolve) => {
            release = resolve;
          });
        return 'v3';
      },
    },
    drafts,
  );
  await session.open('2090-05-01');
  session.edit({ ...emptyNote(), body: 'first' });
  const pending = session.save();
  session.edit({ ...emptyNote(), body: 'latest' });
  assert.equal(session.save(), pending);
  assert.equal(writes.length, 1);
  release('v2');
  assert.equal(await pending, true);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].note.body, 'latest');
  assert.equal(writes[1].version, 'v2');
  assert.equal(session.hasUnsaved(), false);
  assert.equal(drafts.entries.size, 0);
});

void test('date switching saves the previous date and stays put on save failure or conflict', async () => {
  const drafts = memoryDrafts();
  const dates: string[] = [];
  let failure: Error | null = null;
  const session = new NoteSession(
    '2090-06-01',
    {
      read: async (date) => record(date),
      write: async (date) => {
        dates.push(date);
        if (failure) throw failure;
        return 'v2';
      },
    },
    drafts,
  );
  await session.open('2090-06-01');
  session.edit({ ...emptyNote(), body: 'saved before navigation' });
  assert.equal(await session.open('2090-06-02'), true);
  assert.deepEqual(dates, ['2090-06-01']);
  session.edit({ ...emptyNote(), body: 'keep my draft' });
  failure = new Error('offline');
  assert.equal(await session.open('2090-06-03'), false);
  assert.equal(session.getSnapshot().date, '2090-06-02');
  failure = new SaveConflict('conflict');
  assert.equal(await session.open('2090-06-03'), false);
  assert.equal(session.getSnapshot().status, 'conflict');
  assert.equal(drafts.entries.get('2090-06-02')!.note.body, 'keep my draft');
});

void test('failed reads do not save empty notes; refresh reloads archived changes; drafts recover with conflict', async () => {
  let fail = true;
  let body = 'old';
  const writes: string[] = [];
  const transport: NoteTransport = {
    read: async (date) => {
      if (fail) throw new Error('offline');
      return record(date, body);
    },
    write: async (date) => {
      writes.push(date);
      return 'v2';
    },
  };
  const drafts = memoryDrafts();
  const session = new NoteSession('2090-07-01', transport, drafts);
  assert.equal(await session.open('2090-07-01'), false);
  assert.equal(await session.save(), false);
  assert.deepEqual(writes, []);
  fail = false;
  await session.open('2090-07-01');
  body = 'archived';
  await session.open('2090-07-01', true);
  assert.equal(session.getSnapshot().note.body, 'archived');
  drafts.write('2090-07-02', {
    note: { ...emptyNote(), body: 'recovered' },
    version: 'older',
  });
  await session.open('2090-07-02');
  assert.equal(session.getSnapshot().note.body, 'recovered');
  assert.equal(session.getSnapshot().status, 'conflict');
  assert.equal(await session.save(), false);
});
