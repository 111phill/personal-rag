'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionCommand, DailyActions } from '@/lib/actions';
import { actionMarkdown } from '@/lib/actions';
import { localDate } from '@/lib/daily-note';

type Drafts = {
  edits: Record<string, { content: string; version: number }>;
  today: string;
  tomorrow: string;
  pending: ActionCommand | null;
};
const blank = (): Drafts => ({
  edits: {},
  today: '',
  tomorrow: '',
  pending: null,
});
export function useActionPool(
  date: string,
  beforeWrite: () => Promise<boolean>,
  onState: (status: string) => void,
) {
  const [data, setData] = useState<DailyActions | null>(null);
  const [drafts, setDrafts] = useState<Drafts>(blank);
  const draftRef = useRef(drafts);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const flight = useRef<Promise<boolean> | null>(null);
  const versions = useRef(new Map<string, number>());
  const alive = useRef(true);
  const loadSeq = useRef(0);
  const key = `action-drafts:v1:${date}`;
  const put = (value: Drafts) => {
    draftRef.current = value;
    setDrafts(value);
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      setError('浏览器草稿备份失败，请保存后再关闭页面');
    }
  };
  const dirty = () =>
    Object.keys(draftRef.current.edits).length > 0 ||
    !!draftRef.current.today.trim() ||
    !!draftRef.current.tomorrow.trim() ||
    !!draftRef.current.pending;
  const reload = useCallback(async () => {
    const seq = ++loadSeq.current;
    const response = await fetch(`/api/actions?date=${date}`, {
      cache: 'no-store',
    });
    const body = (await response.json()) as DailyActions & { error?: string };
    if (!response.ok) throw new Error(body.error ?? '行动读取失败');
    if (alive.current && seq === loadSeq.current) {
      setData(body as DailyActions);
      if (!flight.current) versions.current.clear();
    }
  }, [date]);
  useEffect(() => {
    alive.current = true;
    void Promise.resolve()
      .then(() => {
        if (!alive.current) return;
        try {
          const raw = sessionStorage.getItem(key);
          if (raw) {
            const d = JSON.parse(raw) as Drafts;
            if (
              !d.edits ||
              typeof d.today !== 'string' ||
              typeof d.tomorrow !== 'string'
            )
              throw new Error();
            draftRef.current = d;
            setDrafts(d);
          }
        } catch {
          setError('行动草稿无法读取，请勿清理浏览器数据');
        }
        setRestored(true);
        return reload();
      })
      .catch((e) => setError(e.message));
    return () => {
      alive.current = false;
    };
  }, [key, reload]);
  useEffect(() => {
    const refresh = () => {
      if (!flight.current) void reload().catch((e) => setError(e.message));
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    const visibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reload]);
  useEffect(() => {
    onState(
      busy
        ? 'saving'
        : error
          ? 'error'
          : !data || !restored
            ? 'loading'
            : dirty()
              ? 'idle'
              : 'saved',
    );
  }, [busy, error, data, drafts, restored, onState]);
  const send = async (command: ActionCommand) => {
    put({ ...draftRef.current, pending: command });
    const response = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    const body = (await response.json()) as {
      id: string;
      version: number;
      error?: string;
    };
    if (!response.ok) {
      if (response.status === 400) put({ ...draftRef.current, pending: null });
      throw Object.assign(new Error(body.error ?? '行动保存失败'), {
        status: response.status,
      });
    }
    versions.current.set(body.id, body.version);
    const next: Drafts = {
      ...draftRef.current,
      edits: { ...draftRef.current.edits },
      pending: null,
    };
    if (command.operation === 'edit') {
      const edit = next.edits[command.id!];
      if (edit?.content.trim() === command.content?.trim())
        delete next.edits[command.id!];
      else if (edit)
        next.edits[command.id!] = { ...edit, version: body.version };
    }
    if (command.operation === 'create') {
      const schedule = command.schedule === 'today' ? 'today' : 'tomorrow';
      if (next[schedule].trim() === command.content?.trim())
        next[schedule] = '';
    }
    put(next);
  };
  const run = (operation?: () => Promise<void>) => {
    if (flight.current) return flight.current;
    const work = async () => {
      setBusy(true);
      setError('');
      try {
        if (!(await beforeWrite()))
          throw new Error('请先保存日记正文，再重试行动保存');
        if (draftRef.current.pending) await send(draftRef.current.pending);
        for (const [id, edit] of Object.entries(draftRef.current.edits))
          await send({
            requestId: crypto.randomUUID(),
            viewDate: date,
            id,
            expectedVersion: versions.current.get(id) ?? edit.version,
            operation: 'edit',
            content: edit.content,
          });
        for (const schedule of ['today', 'tomorrow'] as const) {
          if (draftRef.current[schedule].trim())
            await send({
              requestId: crypto.randomUUID(),
              viewDate: date,
              operation: 'create',
              content: draftRef.current[schedule],
              schedule,
            });
        }
        if (operation) await operation();
        await reload();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存失败，草稿已保留');
        return false;
      } finally {
        setBusy(false);
        flight.current = null;
      }
    };
    flight.current = work();
    return flight.current;
  };
  const mutate = (
    id: string,
    operation: ActionCommand['operation'],
    version: number,
    scheduledDate?: string,
  ) => {
    const perform = () =>
      run(async () => {
        await send({
          requestId: crypto.randomUUID(),
          viewDate: date,
          id,
          operation,
          expectedVersion: versions.current.get(id) ?? version,
          scheduledDate,
        });
      });
    return flight.current
      ? flight.current.then((ok) => (ok ? perform() : false))
      : perform();
  };
  const edit = (id: string, content: string, version: number) =>
    put({
      ...draftRef.current,
      edits: {
        ...draftRef.current.edits,
        [id]: {
          content,
          version: draftRef.current.edits[id]?.version ?? version,
        },
      },
    });
  const compose = (schedule: 'today' | 'tomorrow', text: string) =>
    put({ ...draftRef.current, [schedule]: text });
  const exportText = () =>
    [
      actionMarkdown(data?.items ?? []),
      ...Object.entries(draftRef.current.edits).map(
        ([id, d]) => `- 草稿 ${id}: ${d.content}`,
      ),
      draftRef.current.today && `- 今日草稿: ${draftRef.current.today}`,
      draftRef.current.tomorrow && `- 明日草稿: ${draftRef.current.tomorrow}`,
    ]
      .filter(Boolean)
      .join('\n');
  const reconcile = async () => {
    try {
      if (draftRef.current.pending) {
        try {
          await send(draftRef.current.pending);
        } catch (e) {
          if (
            !(
              e instanceof Error &&
              'status' in e &&
              typeof e.status === 'number' &&
              e.status < 500
            )
          ) {
            setError('请求结果仍未确认，请保持页面并重试，避免重复创建');
            return;
          }
        }
      }
      const response = await fetch(`/api/actions?date=${date}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        setError('读取失败，草稿仍保留');
        return;
      }
      const current = (await response.json()) as DailyActions;
      const edits = { ...draftRef.current.edits };
      const all = [...current.items, ...current.carryover, ...current.future];
      for (const [id, d] of Object.entries(edits)) {
        const a = all.find((a) => a.id === id);
        if (a) d.version = a.version;
      }
      put(
        date === localDate()
          ? { ...draftRef.current, edits, pending: null }
          : blank(),
      );
      versions.current.clear();
      setData(current);
      setError('');
    } catch {
      setError('重新读取失败，草稿仍保留');
    }
  };
  return {
    data,
    drafts,
    error,
    busy,
    restored,
    dirty,
    flush: () => flight.current ?? (dirty() ? run() : Promise.resolve(true)),
    retry: () => run(),
    mutate,
    edit,
    compose,
    exportText,
    reconcile,
    canEdit: date === localDate() && !!data && data.today === localDate(),
  };
}
