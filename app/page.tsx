'use client';
import { Check, Menu, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AssistantPanel } from '@/components/assistant-panel';
import { DailyEditor } from '@/components/daily-editor';
import { InboxView } from '@/components/inbox-view';
import { LibraryView } from '@/components/library-view';
import { navigation, NoteSidebar } from '@/components/note-sidebar';
import type { ViewKey } from '@/components/note-sidebar';
import { useDailyNote } from '@/hooks/use-daily-note';
import { displayDate, localDate, markdownNote } from '@/lib/daily-note';
import type { NoteSummary } from '@/lib/daily-note';

export default function Home() {
  const [activeView, setActiveView] = useState<ViewKey>('today');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recentNotes, setRecentNotes] = useState<NoteSummary[]>([]);
  const [listError, setListError] = useState('');
  const { date, note, status, ready, switching, error, session } =
    useDailyNote();
  const refreshNotes = useCallback(async () => {
    const response = await fetch(`/api/notes?q=${encodeURIComponent(query)}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('最近笔记读取失败，请重试');
    return ((await response.json()) as { notes: NoteSummary[] }).notes;
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      refreshNotes()
        .then((items) => {
          if (!cancelled) {
            setRecentNotes(items);
            setListError('');
          }
        })
        .catch(() => {
          if (!cancelled) setListError('最近笔记读取失败，请刷新页面重试');
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refreshNotes, status]);

  async function openDate(nextDate: string) {
    if (await session.open(nextDate)) {
      setActiveView('today');
      setMobileNavOpen(false);
    }
  }
  async function navigate(view: ViewKey) {
    if (view === 'today') {
      if (!(await session.open(localDate(), true))) return;
    } else if (ready && !(await session.save())) return;
    setActiveView(view);
    setMobileNavOpen(false);
  }
  async function onArchived() {
    await session.open(date, true);
    try {
      setRecentNotes(await refreshNotes());
    } catch {
      setListError('归档已保存，最近笔记刷新失败');
    }
  }
  function exportDraft() {
    const url = URL.createObjectURL(
      new Blob([markdownNote(note)], { type: 'text/markdown;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${date}-草稿.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reloadLatest() {
    exportDraft();
    if (!window.confirm('草稿已发起下载。确认保存好草稿后，读取最新版本？'))
      return;
    try {
      await session.reload();
    } catch {
      setListError('读取失败，当前草稿仍保留');
    }
  }
  const sidebar = (mobile = false) => (
    <NoteSidebar
      mobile={mobile}
      selectedDate={date}
      activeView={activeView}
      query={query}
      recentNotes={recentNotes}
      onQuery={setQuery}
      onOpenDate={openDate}
      onNavigate={navigate}
    />
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="relative z-10 w-72 overflow-y-auto">
            {sidebar(true)}
            <Button
              className="absolute right-2 top-2"
              variant="outline"
              size="sm"
              onClick={() => setMobileNavOpen(false)}
            >
              关闭
            </Button>
          </div>
          <button
            className="flex-1 bg-foreground/20 backdrop-blur-sm"
            aria-label="关闭菜单"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}
      <div className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)_320px] max-xl:grid-cols-[220px_minmax(0,1fr)] max-md:block">
        {sidebar()}
        <section className="min-w-0">
          <header className="flex h-16 items-center justify-between border-b px-6 lg:px-10">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="打开菜单"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu />
              </Button>
              <span className="text-sm text-muted-foreground">知识库 /</span>
              <span className="text-sm">
                {activeView === 'today'
                  ? displayDate(date)
                  : navigation.find((item) => item.key === activeView)?.label}
              </span>
            </div>
            {activeView === 'today' && (
              <div className="flex items-center gap-2">
                <output className="hidden text-xs text-muted-foreground sm:inline">
                  {
                    {
                      loading: '正在读取…',
                      idle: '等待自动保存',
                      saving: '正在保存…',
                      saved: '已保存',
                      error: '操作失败',
                      conflict: '版本冲突，草稿保留',
                    }[status]
                  }
                </output>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void session.save();
                  }}
                  disabled={
                    !ready ||
                    switching ||
                    status === 'saving' ||
                    status === 'conflict'
                  }
                >
                  {status === 'saved' ? <Check /> : <Sparkles />}
                  {status === 'saving' ? '保存中' : '保存笔记'}
                </Button>
              </div>
            )}
          </header>
          {(error || listError) && (
            <div
              role="alert"
              className="mx-6 mt-4 rounded-xl border border-destructive/40 bg-card p-4 text-sm"
            >
              <p>{error || listError}</p>
              {error && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={exportDraft}>
                    导出当前草稿
                  </Button>
                  {status === 'conflict' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void reloadLatest();
                      }}
                    >
                      导出并读取最新版本
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void (ready
                          ? session.save()
                          : session.open(date, true));
                      }}
                    >
                      重试
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          <article className="mx-auto max-w-3xl px-6 pb-20 pt-12 lg:px-12">
            {activeView === 'today' ? (
              <DailyEditor
                date={date}
                note={note}
                disabled={!ready || switching}
                onChange={session.edit}
              />
            ) : activeView === 'inbox' ? (
              <InboxView onArchived={onArchived} />
            ) : (
              <LibraryView
                key={activeView}
                kind={activeView}
                onArchived={onArchived}
              />
            )}
          </article>
        </section>
        <AssistantPanel />
      </div>
    </main>
  );
}
