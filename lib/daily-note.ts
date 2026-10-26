export type Goal = { id: string; text: string; completed: boolean };
export type LegacyDailyNote = {
  goals: Goal[];
  body: string;
  thought: string;
  actions: Goal[];
};
export type DailyNote = Pick<LegacyDailyNote, 'body' | 'thought'>;
export type NoteRecord = {
  date: string;
  title: string;
  content: string;
  updatedAt: string;
};
export type NoteSummary = Pick<NoteRecord, 'date' | 'title'>;

export function emptyNote(): DailyNote {
  return { body: '', thought: '' };
}

export function isDailyNote(value: unknown): value is DailyNote {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.body === 'string' &&
    typeof record.thought === 'string' &&
    !('goals' in record) &&
    !('actions' in record)
  );
}

function legacyList(value: unknown): Goal[] | null {
  if (!Array.isArray(value)) return null;
  const result: Goal[] = [];
  for (const item of value as unknown[]) {
    if (!item || typeof item !== 'object') return null;
    const goal = item as Record<string, unknown>;
    if (
      !(goal.id == null || typeof goal.id === 'string') ||
      typeof goal.text !== 'string' ||
      typeof goal.completed !== 'boolean'
    )
      return null;
    result.push({
      id: typeof goal.id === 'string' ? goal.id : '',
      text: goal.text,
      completed: goal.completed,
    });
  }
  return result;
}

export function readNoteEnvelope(content: string): {
  format: 'daily-note-v1' | 'daily-note-v2';
  note: unknown;
} | null {
  if (!content.trimStart().startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    if (content.trimStart().startsWith('{"format":"daily-note-v')) throw error;
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  return record.format === 'daily-note-v1' || record.format === 'daily-note-v2'
    ? { format: record.format, note: record.note }
    : null;
}

export function parseLegacyNote(content: string): LegacyDailyNote {
  const envelope = readNoteEnvelope(content);
  if (envelope?.format === 'daily-note-v2') {
    if (!isDailyNote(envelope.note))
      throw new Error('笔记数据格式损坏，请保留原文');
    return { ...envelope.note, goals: [], actions: [] };
  }
  if (envelope?.format === 'daily-note-v1') {
    const note = envelope.note as Record<string, unknown> | null;
    const goals = legacyList(note?.goals);
    const actions = legacyList(note?.actions);
    if (
      !note ||
      typeof note.body !== 'string' ||
      typeof note.thought !== 'string' ||
      !goals ||
      !actions
    )
      throw new Error('笔记数据格式损坏，请保留原文');
    return { body: note.body, thought: note.thought, goals, actions };
  }
  // 仅用于读取旧版 Markdown；新记录的分区不再依赖标题文本。
  if (!content.startsWith('## 今日目标'))
    return { ...emptyNote(), body: content, goals: [], actions: [] };
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
  return JSON.stringify({
    format: 'daily-note-v2',
    note: { body: note.body, thought: note.thought },
  });
}

export function parseNote(content: string): DailyNote {
  const { body, thought } = parseLegacyNote(content);
  return { body, thought };
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
  return `## 工作与学习\n${note.body}\n\n## 思考\n${note.thought}`;
}

export function localDate(value = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
    value,
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
