import { markdownNote, parseNote } from './daily-note.ts';

export type AgentSource = {
  id: string;
  kind: 'daily' | 'work' | 'learning' | 'insights' | 'inbox';
  targetId: string;
  title: string;
  date: string;
  content: string;
  updatedAt: string;
};
export type SourceReference = Omit<AgentSource, 'content' | 'updatedAt'> & {
  number: number;
};

export function readableDaily(content: string): string {
  try {
    const note = parseNote(content);
    if (!note.body.trim() && !note.thought.trim() && !note.goals.some((goal) => goal.text.trim()) && !note.actions.some((action) => action.text.trim())) return '';
    return markdownNote(note);
  } catch {
    return content;
  }
}

function searchTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9]{2,}/gu) ?? [];
  const terms = new Set<string>();
  for (const word of words) {
    if (/^[\p{Script=Han}]+$/u.test(word)) {
      if (word.length >= 2) terms.add(word);
      for (let i = 0; i < word.length - 1; i++) terms.add(word.slice(i, i + 2));
    } else terms.add(word);
  }
  return [...terms].filter((term) => !['最近', '什么', '怎么', '我的', '一下', '可以', '时候'].includes(term));
}

export function selectContext(sources: AgentSource[], query: string): AgentSource[] {
  const terms = searchTerms(query);
  const ranked = sources
    .map((source) => {
      const haystack = `${source.title}\n${source.content}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? term.length : 0), 0);
      return { source, score };
    })
    .sort((a, b) => b.score - a.score || b.source.updatedAt.localeCompare(a.source.updatedAt));
  const relevant = ranked.filter((item) => item.score > 0).slice(0, 8).map((item) => item.source);
  const recent = [...sources].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const selected = new Map<string, AgentSource>();
  for (const source of [...relevant, ...recent]) selected.set(source.id, source);
  return [...selected.values()].slice(0, 10).map((source) => {
    const lower = source.content.toLowerCase();
    const hit = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, hit - 180);
    const content = `${start ? '…' : ''}${source.content.slice(start, start + 900)}${start + 900 < source.content.length ? '…' : ''}`;
    return { ...source, content };
  });
}

export function sourceReference(source: AgentSource, number: number): SourceReference {
  const { id, kind, targetId, title, date } = source;
  return { id, kind, targetId, title, date, number };
}

export function validatedReferences(answer: string, sources: AgentSource[]): SourceReference[] {
  const numbers = [...answer.matchAll(/【(\d{1,2})】/g)].map((match) => Number(match[1]));
  return [...new Set(numbers)]
    .filter((number) => number >= 1 && number <= sources.length)
    .map((number) => sourceReference(sources[number - 1], number));
}

export function suggestedQuestions(sources: AgentSource[]): string[] {
  const questions: string[] = [];
  if (sources.some((source) => source.kind === 'daily')) questions.push('结合最近的记录，我的目标进展如何？');
  if (sources.some((source) => source.kind === 'work')) questions.push('最近工作中反复出现的困难是什么？');
  if (sources.some((source) => source.kind === 'learning')) questions.push('我近期的学习重点有什么变化？');
  if (sources.some((source) => source.kind === 'insights')) questions.push('我的思考里有哪些值得继续探索的线索？');
  if (sources.some((source) => source.kind === 'inbox')) questions.push('收集箱里有哪些想法值得先处理？');
  return questions.slice(0, 3);
}
