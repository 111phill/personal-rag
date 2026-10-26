import { localRuntime, migrate } from './database-local.mjs';
import { migrateActions } from '../db/migrate-actions.ts';

const runtime = localRuntime();
try {
  const db = await runtime.getD1Database('DB');
  await migrate(db);
  for (const warning of await migrateActions(db)) console.warn(warning);
  console.log('本地数据库结构已就绪，已有笔记保留。');
} finally {
  await runtime.dispose();
}
