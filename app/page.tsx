'use client';
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  Circle,
  LoaderCircle,
  Menu,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AssistantPanel } from '@/components/assistant-panel';
import { ActionPool } from '@/components/action-pool';
import { WeeklyReview } from '@/components/weekly-review';
import type { SaveParticipant } from '@/lib/save-participant';
import { DailyEditor } from '@/components/daily-editor';
import { InboxView } from '@/components/inbox-view';
import { LibraryView } from '@/components/library-view';
import { navigation, NoteSidebar } from '@/components/note-sidebar';
import type { ViewKey } from '@/components/note-sidebar';
import { useDailyNote } from '@/hooks/use-daily-note';
import { displayDate, localDate, markdownNote } from '@/lib/daily-note';
import type { NoteSummary } from '@/lib/daily-note';
import type { SourceReference } from '@/lib/agent-context';

export default function Home() {
  const [activeView, setActiveView] = useState<ViewKey>('today');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const agentTrigger = useRef<HTMLButtonElement>(null);
  const closeAgent = useCallback(() => {
    setAgentOpen(false);
    agentTrigger.current?.focus();
  }, []);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [recentNotes, setRecentNotes] = useState<NoteSummary[]>([]);
  const [listError, setListError] = useState('');
  const participant = useRef<SaveParticipant>(null);
  const [actionStatus, setActionStatus] = useState('loading');
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const {
    date,
    note,
    status: noteStatus,
    ready,
    switching,
    error,
    session,
  } = useDailyNote();
  const status =
    activeView === 'today' && (noteStatus === 'saved' || noteStatus === 'idle')
      ? actionStatus === 'error'
        ? 'error'
        : actionStatus === 'saving'
          ? 'saving'
          : actionStatus === 'loading'
            ? 'loading'
            : actionStatus === 'idle' || noteStatus === 'idle'
              ? 'idle'
              : 'saved'
      : noteStatus;
  async function saveAll() {
    if (ready && !(await session.save())) return false;
    return (await participant.current?.flush()) ?? true;
  }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (participant.current?.dirty()) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    let previous = localDate();
    const tick = () => {
      const today = localDate();
      if (
        today !== previous &&
        activeView === 'today' &&
        date === previous &&
        !session.hasUnsaved() &&
        !participant.current?.dirty()
      )
        void session.open(today);
      previous = today;
    };
    const timer = window.setInterval(tick, 10000);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [activeView, date, session]);
  useEffect(() => {
    if (!focusTarget) return;
    const focus = () => {
      const target = document.getElementById(focusTarget);
      if (!target) return false;
      for (
        let parent = target.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
      return true;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => {
      if (focus()) observer.disconnect();
    });
    observer.observe(document.getElementById('main-content')!, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [focusTarget, date, activeView]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const dialog = mobileDialog.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);
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
    if (!(await saveAll())) return;
    if (await session.open(nextDate)) {
      setActiveView('today');
      setMobileNavOpen(false);
    }
  }
  async function navigate(view: ViewKey) {
    if (!(await saveAll())) return;
    if (view === 'today') {
      if (!(await session.open(localDate(), true))) return;
    } else if (ready && !(await session.save())) return;
    setActiveView(view);
    setMobileNavOpen(false);
  }
  async function openActionSource(sourceDate: string, id: string) {
    if (!(await saveAll())) return;
    if (!(await session.open(sourceDate))) return;
    setActiveView('today');
    setMobileNavOpen(false);
    setFocusTarget(`action-${id}`);
  }
  async function openSource(source: SourceReference) {
    if (source.kind === 'daily') await openDate(source.targetId);
    else await navigate(source.kind);
    setAgentOpen(false);
    window.setTimeout(() => {
      const target = document.getElementById(`record-${source.targetId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
      if (!target) agentTrigger.current?.focus();
    }, 120);
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
    let legacyDraft = '';
    try {
      const raw = sessionStorage.getItem(`daily-draft:${date}`);
      if (raw) {
        const d = JSON.parse(raw) as { note?: Record<string, unknown> };
        if (d.note && ('goals' in d.note || 'actions' in d.note))
          legacyDraft = '\n\n## 旧版草稿原文\n\n```json\n' + raw + '\n```';
      }
    } catch {
      /* Export the current editor even when browser storage is unavailable. */
    }
    const url = URL.createObjectURL(
      new Blob(
        [
          markdownNote(note),
          '\n\n## 行动\n',
          participant.current?.exportText() ?? '',
          legacyDraft,
        ],
        { type: 'text/markdown;charset=utf-8' },
      ),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${date}-每日手记.md`;
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
    <main className="workbench">
      <a className="skip-link" href="#main-content">
        跳转到记录内容
      </a>
      <dialog
        ref={mobileDialog}
        className="mobile-nav-dialog"
        aria-label="知识库导航"
        onCancel={() => setMobileNavOpen(false)}
        onClose={() => setMobileNavOpen(false)}
      >
        {sidebar(true)}
        <Button
          className="mobile-nav-close"
          variant="ghost"
          size="icon"
          aria-label="关闭菜单"
          onClick={() => setMobileNavOpen(false)}
        >
          <X />
        </Button>
      </dialog>
      <div className="app-shell">
        {sidebar()}
        <section className="min-w-0">
          <header className="workbench-header">
            <div className="header-breadcrumb">
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu-button"
                aria-label="打开菜单"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu />
              </Button>
              <span className="breadcrumb-parent">个人空间</span>
              <ChevronRight
                size={13}
                className="breadcrumb-divider"
                aria-hidden="true"
              />
              <span className="breadcrumb-current">
                {activeView === 'today'
                  ? `每日记录 · ${displayDate(date)}`
                  : navigation.find((item) => item.key === activeView)?.label}
              </span>
            </div>
            {activeView === 'today' && (
              <div className="header-actions">
                <output
                  className={`save-status status-${status}`}
                  aria-live="polite"
                >
                  {status === 'saved' ? (
                    <Check size={13} aria-hidden="true" />
                  ) : status === 'saving' || status === 'loading' ? (
                    <LoaderCircle
                      size={13}
                      className="saving-spinner"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle size={8} aria-hidden="true" />
                  )}
                  {
                    {
                      loading: '正在读取…',
                      idle: '待保存',
                      saving: '正在保存…',
                      saved: '已保存',
                      error: '操作失败',
                      conflict: '版本冲突，草稿保留',
                    }[status]
                  }
                </output>
                <Button
                  variant="ghost"
                  size="icon"
                  className="header-export"
                  aria-label="导出当前笔记"
                  disabled={!ready}
                  onClick={exportDraft}
                >
                  <ArrowDownToLine size={17} />
                </Button>
                <Button
                  className="save-note-button"
                  size="sm"
                  onClick={() => {
                    void saveAll();
                  }}
                  disabled={
                    !ready ||
                    switching ||
                    status === 'saving' ||
                    status === 'conflict'
                  }
                >
                  {status === 'saving' ? (
                    <LoaderCircle className="saving-spinner" />
                  ) : (
                    <Save />
                  )}
                  {status === 'saving' ? '保存中' : '保存笔记'}
                </Button>
              </div>
            )}
            <Button
              ref={agentTrigger}
              variant="outline"
              size="sm"
              className="agent-trigger"
              aria-label="打开记录对话 Agent"
              aria-expanded={agentOpen}
              onClick={() => setAgentOpen(true)}
            >
              <Sparkles size={16} />
              <span>与你共想</span>
            </Button>
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
          <article
            id="main-content"
            tabIndex={-1}
            className="workspace-content"
          >
            {activeView === 'today' ? (
              <DailyEditor
                date={date}
                note={note}
                disabled={!ready || switching}
                onChange={session.edit}
                onOpenDate={openDate}
              >
                <ActionPool
                  key={date}
                  date={date}
                  handle={participant}
                  beforeWrite={session.save}
                  onState={setActionStatus}
                  onSource={(d, id) => void openActionSource(d, id)}
                  focusId={
                    focusTarget?.startsWith('action-')
                      ? focusTarget.slice(7)
                      : null
                  }
                />
              </DailyEditor>
            ) : activeView === 'review' ? (
              <WeeklyReview
                handle={participant}
                onActionSource={(d, id) => void openActionSource(d, id)}
                onSource={(source) => {
                  if (source.kind === 'daily') void openDate(source.id);
                  else {
                    const kind = source.kind;
                    void (async () => {
                      await navigate(kind);
                      setFocusTarget(`record-${source.id}`);
                    })();
                  }
                }}
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
        <AssistantPanel
          open={agentOpen}
          onClose={closeAgent}
          onOpenSource={openSource}
        />
      </div>
    </main>
  );
}
