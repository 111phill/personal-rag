import { emptyNote, parseNote, serializeNote } from './daily-note.ts';
import type { DailyNote, NoteRecord } from './daily-note.ts';

export type SaveStatus =
  | 'loading'
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict';
export type SessionSnapshot = {
  date: string;
  note: DailyNote;
  status: SaveStatus;
  error: string;
  ready: boolean;
  switching: boolean;
};
export type Draft = { note: DailyNote; version: string | null };
export type NoteTransport = {
  read: (date: string) => Promise<NoteRecord | null>;
  write: (
    date: string,
    note: DailyNote,
    version: string | null,
  ) => Promise<string>;
};
export type DraftStore = {
  read: (date: string) => Draft | null;
  write: (date: string, draft: Draft) => void;
  remove: (date: string) => void;
};
export class SaveConflict extends Error {}

export class NoteSession {
  private state: SessionSnapshot;
  private version: string | null = null;
  private savedContent = '';
  private listeners = new Set<() => void>();
  private pending: Promise<boolean> | null = null;
  private navigationPending = false;
  private transport: NoteTransport;
  private drafts: DraftStore;
  constructor(date: string, transport: NoteTransport, drafts: DraftStore) {
    this.state = {
      date,
      note: emptyNote(),
      status: 'loading',
      error: '',
      ready: false,
      switching: false,
    };
    this.transport = transport;
    this.drafts = drafts;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(change: Partial<SessionSnapshot>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener());
  }
  hasUnsaved = () =>
    this.state.ready && serializeNote(this.state.note) !== this.savedContent;

  edit = (note: DailyNote) => {
    if (!this.state.ready || this.state.switching) return;
    let error = this.state.error;
    try {
      this.drafts.write(this.state.date, { note, version: this.version });
    } catch {
      error = '浏览器草稿备份不可用，请确认自动保存成功后再关闭页面。';
    }
    this.publish({
      note,
      status: this.state.status === 'conflict' ? 'conflict' : 'idle',
      error,
    });
  };

  save = (): Promise<boolean> => {
    if (this.pending) return this.pending;
    this.pending = this.flush().finally(() => {
      this.pending = null;
    });
    return this.pending;
  };

  private async flush(): Promise<boolean> {
    if (!this.state.ready || this.state.status === 'conflict') return false;
    while (this.hasUnsaved()) {
      const { date, note } = this.state;
      const content = serializeNote(note);
      this.publish({ status: 'saving', error: '' });
      try {
        this.version = await this.transport.write(date, note, this.version);
        this.savedContent = content;
        // 写入期间仍可输入；下一轮只保存最新草稿。
        if (this.hasUnsaved())
          this.drafts.write(date, {
            note: this.state.note,
            version: this.version,
          });
        else this.drafts.remove(date);
      } catch (error) {
        this.publish({
          status: error instanceof SaveConflict ? 'conflict' : 'error',
          error:
            error instanceof Error ? error.message : '保存失败，草稿已保留',
        });
        return false;
      }
    }
    this.publish({ status: 'saved', error: '' });
    return true;
  }

  open = async (date: string, refresh = false): Promise<boolean> => {
    if (this.navigationPending) return false;
    if (date === this.state.date && this.state.ready && !refresh) return true;
    this.navigationPending = true;
    this.publish({ switching: true });
    try {
      if (this.state.ready && !(await this.save())) return false;
      const previous = this.state;
      this.publish({ status: 'loading', error: '' });
      try {
        const record = await this.transport.read(date);
        const note = parseNote(record?.content ?? '');
        const draft = this.drafts.read(date);
        const dirtyDraft =
          draft && serializeNote(draft.note) !== serializeNote(note);
        const conflict =
          dirtyDraft && draft.version !== (record?.updatedAt ?? null);
        this.version = record?.updatedAt ?? null;
        this.savedContent = record ? serializeNote(note) : '';
        this.publish({
          date,
          note: dirtyDraft ? draft.note : note,
          ready: true,
          status: conflict
            ? 'conflict'
            : dirtyDraft || !record
              ? 'idle'
              : 'saved',
          error: conflict
            ? '已恢复本页草稿，但数据库中有更新版本。请先导出草稿，再读取最新版本合并。'
            : '',
        });
        return true;
      } catch (error) {
        this.publish({
          ...previous,
          status: 'error',
          error: error instanceof Error ? error.message : '读取失败，请重试',
        });
        return false;
      }
    } finally {
      this.navigationPending = false;
      this.publish({ switching: false });
    }
  };

  // 调用方先导出草稿，随后允许用户明确读取数据库版本。
  reload = async (): Promise<boolean> => {
    if (this.pending || this.navigationPending) return false;
    this.navigationPending = true;
    this.publish({ switching: true });
    try {
      const record = await this.transport.read(this.state.date);
      const note = parseNote(record?.content ?? '');
      this.drafts.remove(this.state.date);
      this.version = record?.updatedAt ?? null;
      this.savedContent = record ? serializeNote(note) : '';
      this.publish({
        note,
        ready: true,
        status: record ? 'saved' : 'idle',
        error: '',
      });
      return true;
    } finally {
      this.navigationPending = false;
      this.publish({ switching: false });
    }
  };
}
