import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { getConversation, listMessages, readAgentSources, saveExchange } from '@/db/agent-store';
import { selectContext, validatedReferences } from '@/lib/agent-context';
import { completeChat, modelConfig } from '@/lib/agent-model';

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('conversationId');
  if (!validId(id)) return Response.json({ error: '对话编号无效' }, { status: 400 });
  const db = getDb();
  if (!(await getConversation(db, id))) return Response.json({ error: '对话不存在' }, { status: 404 });
  return Response.json({ messages: await listMessages(db, id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : null;
  const id = data?.conversationId;
  const question = typeof data?.content === 'string' ? data.content.trim() : '';
  if (!validId(id) || !question || question.length > 3000) return Response.json({ error: '请输入 1–3000 字的问题' }, { status: 400 });
  let config;
  try { config = modelConfig(env as unknown as Record<string, string | undefined>); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : '模型配置无效' }, { status: 503 }); }
  if (!config) return Response.json({ error: '尚未配置模型服务，请设置服务地址、模型名和密钥' }, { status: 503 });
  const db = getDb();
  const conversation = await getConversation(db, id);
  if (!conversation) return Response.json({ error: '对话不存在' }, { status: 404 });
  const history = (await listMessages(db, id)).slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
  const previousQuestion = [...history].reverse().find((message) => message.role === 'user')?.content ?? '';
  const sources = selectContext(await readAgentSources(db), `${previousQuestion} ${question}`);
  try {
    const rawAnswer = await completeChat(config, history, question, sources);
    const answer = rawAnswer.replace(/【(\d{1,2})】/g, (marker, digits: string) => Number(digits) <= sources.length && Number(digits) > 0 ? marker : '');
    const references = validatedReferences(answer, sources);
    const messages = await saveExchange(db, conversation, question, answer, references);
    return Response.json({ messages });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '回答生成失败，请重试' }, { status: 502 });
  }
}
