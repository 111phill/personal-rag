import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { readAgentSources } from '@/db/agent-store';
import { suggestedQuestions } from '@/lib/agent-context';
import { modelConfig } from '@/lib/agent-model';

export async function GET() {
  let configured = false;
  let configurationError = '';
  try { configured = Boolean(modelConfig(env as unknown as Record<string, string | undefined>)); }
  catch (error) { configurationError = error instanceof Error ? error.message : '模型配置无效'; }
  const suggestions = suggestedQuestions(await readAgentSources(getDb()));
  return Response.json({ configured, configurationError, suggestions }, { headers: { 'Cache-Control': 'no-store' } });
}
