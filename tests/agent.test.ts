import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { localRuntime, migrate } from '../scripts/database-local.mjs';
import { createConversation, listConversations, listMessages, readAgentSources, saveExchange } from '../db/agent-store.ts';
import { selectContext, suggestedQuestions, validatedReferences } from '../lib/agent-context.ts';
import { completeChat, modelConfig } from '../lib/agent-model.ts';
import { emptyNote, serializeNote } from '../lib/daily-note.ts';

const runtime = localRuntime(false);
after(() => runtime.dispose());

async function database() {
  const db = (await runtime.getD1Database('DB')) as unknown as D1Database;
  await migrate(db);
  return db;
}

void test('retrieval covers saved spaces, keeps structured goals readable and excludes deleted content', async () => {
  const db = await database();
  const now = '2026-10-14T08:00:00.000Z';
  const daily = serializeNote({ ...emptyNote(), goals: [{ id: 'g', text: '每周运动三次', completed: false }], body: '本周加班，运动计划受影响。' });
  await db.prepare("INSERT INTO notes (date,title,content,category,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind('2026-10-13', '周二手记', daily, 'daily', now, now).run();
  for (const [id, kind, title, content, status] of [
    ['work-1', 'work', '项目压力', '连续加班三天', 'active'],
    ['learn-1', 'learning', '学习计划', '开始学习营养基础', 'active'],
    ['idea-1', 'insights', '生活想法', '希望建立可持续的运动习惯', 'active'],
    ['deleted-1', 'work', '不应出现', '私人秘密测试词', 'deleted'],
  ]) await db.prepare('INSERT INTO knowledge_items (id,kind,title,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(id, kind, title, content, status, now, now).run();
  await db.prepare('INSERT INTO inbox_items (id,content,status,created_at,updated_at) VALUES (?,?,?,?,?)').bind('inbox-1', '明天试试饭后散步', 'pending', now, now).run();
  const sources = await readAgentSources(db);
  assert.deepEqual(new Set(sources.map((source) => source.kind)), new Set(['daily', 'work', 'learning', 'insights', 'inbox']));
  assert.ok(sources.find((source) => source.kind === 'daily')?.content.includes('每周运动三次'));
  assert.ok(!sources.some((source) => source.content.includes('私人秘密测试词')));
  assert.ok(suggestedQuestions(sources).length > 0);
  const selected = selectContext(sources, '加班后如何继续运动计划');
  assert.ok(selected.some((source) => source.kind === 'daily'));
  assert.ok(selected.some((source) => source.kind === 'work'));
  assert.deepEqual(validatedReferences('结合记录【1】和无效编号【99】', selected).map((source) => source.number), [1]);
  const longSource = { ...sources[0], id: 'long', content: `${'背景'.repeat(600)}明确命中词${'后文'.repeat(600)}` };
  assert.ok(selectContext([longSource], '明确命中词')[0].content.includes('明确命中词'));
});

void test('conversation exchanges persist independently and preserve verified sources', async () => {
  const db = await database();
  const first = await createConversation(db);
  const second = await createConversation(db);
  const sources = selectContext(await readAgentSources(db), '运动');
  const references = validatedReferences('你曾记录运动目标【1】', sources);
  await saveExchange(db, first, '我的运动目标如何？', '你曾记录运动目标【1】', references);
  await saveExchange(db, second, '另一个话题', '可以继续聊。', []);
  const restored = await listMessages(db, first.id);
  assert.equal(restored.length, 2);
  assert.equal(restored[1].sources[0]?.id, references[0]?.id);
  assert.equal((await listMessages(db, second.id)).length, 2);
  assert.equal((await listConversations(db)).length, 2);
});

void test('compatible model request is bounded, validates configuration, and surfaces timeout', async () => {
  assert.equal(modelConfig({}), null);
  const config = modelConfig({ AGENT_API_BASE_URL: 'https://example.com/v1', AGENT_MODEL: 'test-model', AGENT_API_KEY: 'test-key' });
  assert.ok(config);
  let sent = '';
  const fetcher: typeof fetch = async (_url, init) => {
    sent = typeof init?.body === 'string' ? init.body : '';
    return Response.json({ choices: [{ message: { content: '有一条相关记录【1】。' } }] });
  };
  const answer = await completeChat(config, [], '我最近在做什么？', selectContext(await readAgentSources(await database()), '运动'), fetcher);
  assert.equal(answer, '有一条相关记录【1】。');
  assert.ok(sent.includes('test-model'));
  assert.ok(sent.includes('你是个人知识空间里的对话伙伴'));
  await assert.rejects(completeChat(config, [], '测试', [], async () => { throw new DOMException('timeout', 'TimeoutError'); }), /超时/);
});
