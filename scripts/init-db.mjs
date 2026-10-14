import { localRuntime, migrate } from './database-local.mjs';

const runtime = localRuntime();
try {
  await migrate(await runtime.getD1Database('DB'));
  console.log('本地数据库结构已就绪，已有笔记保留。');
} finally {
  await runtime.dispose();
}
