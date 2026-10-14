import { localRuntime } from './database-local.mjs';
import { repairArchives } from '../db/repair-archives.ts';

const runtime = localRuntime();
try {
  console.log(
    `已修复 ${await repairArchives(await runtime.getD1Database('DB'))} 条旧归档。`,
  );
} finally {
  await runtime.dispose();
}
