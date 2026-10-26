import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare } from 'miniflare';

// 使用 Wrangler 所带的本地 D1 实现；测试传 false，绝不读取真实笔记。
/** @param {string | boolean} persist */
export function localRuntime(
  persist = resolve(
    process.env.PERSONAL_RAG_STATE_DIR ?? '.wrangler/state',
    'v3/d1',
  ),
) {
  return new Miniflare({
    modules: true,
    script:
      'export default { fetch() { return new Response("local database"); } }',
    compatibilityDate: '2026-05-15',
    d1Databases: { DB: '00000000-0000-4000-8000-000000000000' },
    d1Persist: persist,
  });
}

export async function migrate(db) {
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)',
    )
    .run();
  const files = (await readdir('drizzle'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of files) {
    if (
      await db
        .prepare('SELECT name FROM local_migrations WHERE name = ?')
        .bind(name)
        .first()
    )
      continue;
    let sql = await readFile(resolve('drizzle', name), 'utf8');
    // 旧版本已经在请求里创建过这三张表；首次登记时只补缺失项。
    if (/^000[012]_/.test(name))
      sql = sql
        .replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ')
        .replace(/CREATE (UNIQUE )?INDEX /g, 'CREATE $1INDEX IF NOT EXISTS ');
    await db.batch([
      ...sql
        .split('--> statement-breakpoint')
        .map((part) => db.prepare(part.trim())),
      db.prepare('INSERT INTO local_migrations (name) VALUES (?)').bind(name),
    ]);
  }
}
