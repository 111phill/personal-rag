import { env } from 'cloudflare:workers';

export function getDb(): D1Database {
  if (!env.DB) throw new Error('本地数据库尚未连接');
  return env.DB;
}
