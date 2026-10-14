export type Goal = { id: string; text: string; completed: boolean };
export type DailyNote = {
  goals: Goal[];
  body: string;
  thought: string;
  actions: Goal[];
};
export type NoteRecord = {
  date: string;
  title: string;
  content: string;
  updatedAt: string;
};
export type NoteSummary = Pick<NoteRecord, 'date' | 'title'>;

export function emptyNote(): DailyNote {
  return { goals: [], body: '', thought: '', actions: [] };
}

export function isDailyNote(value: unknown): value is DailyNote {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.body === 'string' &&
    typeof record.thought === 'string' &&
    [record.goals, record.actions].every(
      (items) =>
        Array.isArray(items) &&
        items.every((item: unknown) => {
          if (!item || typeof item !== 'object') return false;
          const goal = item as Record<string, unknown>;
          return (
            typeof goal.id === 'string' &&
            typeof goal.text === 'string' &&
            typeof goal.completed === 'boolean'
          );
        }),
    )
  );
}

export function parseNote(content: string): DailyNote {
  if (content.startsWith('{"format":"daily-note-v1",')) {
    const parsed: unknown = JSON.parse(content);
    const record = parsed as Record<string, unknown>;
    if (!isDailyNote(record.note))
      throw new Error('笔记数据格式损坏，请保留原文');
    return record.note;
  }
  // 仅用于读取旧版 Markdown；新记录的分区不再依赖标题文本。
  if (!content.startsWith('## 今日目标'))
    return { ...emptyNote(), body: content };
  const [goalBlock = '', ...bodyParts] = content
    .replace(/\r\n/g, '\n')
    .split('\n## 工作与学习\n');
  const [bodyAndThought = '', ...actionParts] = bodyParts
    .join('\n## 工作与学习\n')
    .split('\n## 明日行动\n');
  const [body = '', ...thoughtParts] = bodyAndThought.split('\n## 思考\n');
  function checklist(block: string, prefix: string): Goal[] {
    return block.split('\n').flatMap((line, index) => {
      const match = line.match(/^- \[([ xX])\] (.*)$/);
      return match
        ? [
            {
              id: `${prefix}-${index}`,
              text: match[2],
              completed: match[1].toLowerCase() === 'x',
            },
          ]
        : [];
    });
  }
  return {
    goals: checklist(goalBlock, 'goal'),
    body: body.trimEnd(),
    thought: thoughtParts.join('\n## 思考\n').trimEnd(),
    actions: checklist(actionParts.join('\n## 明日行动\n'), 'action'),
  };
}

export function serializeNote(note: DailyNote): string {
  return JSON.stringify({ format: 'daily-note-v1', note });
}

export function appendToNote(
  content: string,
  section: 'body' | 'thought',
  addition: string,
): string {
  const note = parseNote(content);
  note[section] = [note[section], addition].filter(Boolean).join('\n\n');
  return serializeNote(note);
}

export function markdownNote(note: DailyNote): string {
  const checklist = (items: Goal[]) =>
    items
      .map((item) => `- [${item.completed ? 'x' : ' '}] ${item.text}`)
      .join('\n');
  return `## 今日目标\n${checklist(note.goals)}\n\n## 工作与学习\n${note.body}\n\n## 思考\n${note.thought}\n\n## 明日行动\n${checklist(note.actions)}`;
}

export function localDate(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
    new Date(),
  );
}

export function displayDate(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

export function isDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
