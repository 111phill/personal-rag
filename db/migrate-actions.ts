import { parseLegacyNote, readNoteEnvelope } from '../lib/daily-note.ts';
import { addDays } from '../lib/actions.ts';
import type { Action, ActionEvent } from '../lib/actions.ts';
import { eventStatement, hashValue, insertAction } from './action-store.ts';

const migrationVersion = 'unified-actions-v1';
export async function migrateActions(
  db: D1Database,
  now = new Date().toISOString(),
) {
  const warnings: string[] = [];
  const notes = await db
    .prepare(
      "SELECT id,date,content FROM notes WHERE category='daily' ORDER BY id",
    )
    .all<{ id: number; date: string; content: string }>();
  for (const note of notes.results) {
    const hash = await hashValue(note.content);
    let snapshot = await db
      .prepare(
        'SELECT original_content AS content,content_hash AS hash,imported FROM action_migration_notes WHERE migration_version=? AND note_id=?',
      )
      .bind(migrationVersion, note.id)
      .first<{ content: string; hash: string; imported: number }>();
    if (!snapshot) {
      await db
        .prepare(
          'INSERT INTO action_migration_notes(migration_version,note_id,original_content,content_hash) VALUES(?,?,?,?)',
        )
        .bind(migrationVersion, note.id, note.content, hash)
        .run();
      snapshot = { content: note.content, hash, imported: 0 };
    }
    if (snapshot.hash !== hash)
      warnings.push(
        `${note.date} 原文已变化，使用固定快照，不新增或覆盖已迁移行动`,
      );
    if (snapshot.imported) continue;
    const legacy = parseLegacyNote(snapshot.content);
    const statements: D1PreparedStatement[] = [];
    const structured =
      readNoteEnvelope(snapshot.content)?.format === 'daily-note-v1';
    for (const listType of ['goals', 'actions'] as const) {
      const list = legacy[listType];
      const ids = new Map<string, number>();
      for (const item of list) ids.set(item.id, (ids.get(item.id) ?? 0) + 1);
      for (const [index, item] of list.entries()) {
        if (!item.text.trim()) continue;
        const legacyKey =
          structured && item.id.trim() && ids.get(item.id) === 1
            ? `id:${item.id}`
            : `position:${index}`;
        const id = crypto.randomUUID();
        const scheduledDate =
          listType === 'goals' ? note.date : addDays(note.date, 1);
        const action: Action = {
          id,
          content: item.text,
          status: item.completed
            ? 'completed'
            : listType === 'goals'
              ? 'today'
              : 'deferred',
          sourceDate: note.date,
          scheduledDate,
          createdAt: now,
          completedAt: null,
          goalId: null,
          version: 1,
        };
        const event: ActionEvent = {
          id: crypto.randomUUID(),
          actionId: id,
          actionVersion: 1,
          changedAt: now,
          changeType: 'import',
          statusBefore: null,
          statusAfter: action.status,
          scheduledDateBefore: null,
          scheduledDateAfter: scheduledDate,
          completedAtBefore: null,
          completedAtAfter: null,
          requestId: `import:${note.id}:${listType}:${legacyKey}`,
          requestHash: await hashValue([
            migrationVersion,
            note.id,
            listType,
            legacyKey,
          ]),
        };
        statements.push(
          insertAction(db, action),
          eventStatement(db, event),
          db
            .prepare(
              'INSERT INTO action_migration_map(migration_version,note_id,list_type,legacy_key,action_id) VALUES(?,?,?,?,?)',
            )
            .bind(migrationVersion, note.id, listType, legacyKey, id),
        );
      }
    }
    statements.push(
      db
        .prepare(
          'UPDATE action_migration_notes SET imported=1 WHERE migration_version=? AND note_id=?',
        )
        .bind(migrationVersion, note.id),
    );
    await db.batch(statements);
  }
  return warnings;
}
