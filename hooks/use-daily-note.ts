'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isDailyNote, localDate } from '@/lib/daily-note';
import type { NoteRecord } from '@/lib/daily-note';
import { NoteSession, SaveConflict } from '@/lib/note-session';

export function useDailyNote() {
  const [session] = useState(
    () =>
      new NoteSession(
        localDate(),
        {
          async read(date) {
            const response = await fetch(`/api/notes?date=${date}`, {
              cache: 'no-store',
            });
            if (!response.ok)
              throw new Error('读取笔记失败，未覆盖当前内容，请重试');
            return ((await response.json()) as { note: NoteRecord | null })
              .note;
          },
          async write(date, note, expectedVersion) {
            const response = await fetch('/api/notes', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date, note, expectedVersion }),
            });
            if (response.status === 409)
              throw new SaveConflict(
                '笔记已被其他页面或归档更新。草稿已保留，请先导出，再读取最新版本合并。',
              );
            if (!response.ok) {
              const body = (await response.json().catch(() => null)) as {
                error?: string;
              } | null;
              throw new Error(body?.error ?? '保存失败，草稿已保留，请重试');
            }
            return ((await response.json()) as { updatedAt: string }).updatedAt;
          },
        },
        {
          read(date) {
            const raw = sessionStorage.getItem(`daily-draft:${date}`);
            if (!raw) return null;
            const draft = JSON.parse(raw) as {
              note: unknown;
              version: unknown;
            };
            if (
              !isDailyNote(draft.note) ||
              !(draft.version === null || typeof draft.version === 'string')
            )
              throw new Error('草稿格式异常，请勿清理浏览器数据');
            return { note: draft.note, version: draft.version };
          },
          write(date, draft) {
            sessionStorage.setItem(
              `daily-draft:${date}`,
              JSON.stringify(draft),
            );
          },
          remove(date) {
            sessionStorage.removeItem(`daily-draft:${date}`);
          },
        },
      ),
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    void session.open(localDate());
  }, [session]);
  useEffect(() => {
    if (state.status !== 'idle' || state.switching) return;
    const timer = window.setTimeout(() => {
      void session.save();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [session, state]);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (session.hasUnsaved()) event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session]);
  return { ...state, session };
}
