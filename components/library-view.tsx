'use client';

import {
  BookOpen,
  CalendarPlus,
  FolderKanban,
  Lightbulb,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { SpaceHeading } from '@/components/space-heading';

export type LibraryKind = 'work' | 'learning' | 'insights';
type ItemStatus = 'active' | 'paused' | 'completed';

type LibraryItem = {
  id: string;
  kind: LibraryKind;
  title: string;
  content: string;
  status: ItemStatus;
  sourceInboxId: string | null;
  createdAt: string;
  updatedAt: string;
};

const viewConfig = {
  work: {
    eyebrow: '项目与进展',
    title: '工作记录',
    description: '保存项目进展、关键决策、阻塞问题和下一步行动。',
    titlePlaceholder: '工作或项目名称',
    contentPlaceholder: '记录进展、问题或下一步…',
    action: '新建工作记录',
    icon: FolderKanban,
    statuses: { active: '进行中', paused: '已暂停', completed: '已完成' },
  },
  learning: {
    eyebrow: '输入与理解',
    title: '学习空间',
    description: '用自己的语言记录知识、来源、问题以及可以实践的方向。',
    titlePlaceholder: '学习主题',
    contentPlaceholder: '写下来源、理解、问题和例子…',
    action: '新建学习记录',
    icon: BookOpen,
    statuses: { active: '学习中', paused: '稍后继续', completed: '已掌握' },
  },
  insights: {
    eyebrow: '想法与判断',
    title: '思考',
    description: '保存值得继续推敲的想法，也可以把它归入今天的思考记录。',
    titlePlaceholder: '一句话概括这次思考',
    contentPlaceholder: '说明它来自哪里、为什么成立、适用于什么情况…',
    action: '新建思考',
    icon: Lightbulb,
    statuses: { active: '思考中', paused: '待验证', completed: '已归入今日' },
  },
} as const;

export function LibraryView({
  kind,
  onArchived,
}: {
  kind: LibraryKind;
  onArchived: () => Promise<void>;
}) {
  const config = viewConfig[kind];
  const Icon = config.icon;
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<ItemStatus>('active');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const statusOptions = (
    Object.entries(config.statuses) as [ItemStatus, string][]
  ).filter(([value]) => kind !== 'insights' || value !== 'completed');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/library?kind=${kind}`)
      .then((response) => {
        if (!response.ok) throw new Error('读取失败');
        return response.json();
      })
      .then((data: unknown) => {
        if (!cancelled) {
          setItems((data as { items: LibraryItem[] }).items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage('内容读取失败，请稍后重试');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  async function createItem() {
    if (!title.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, content, status }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error('保存失败');
      setItems((current) => [(data as { item: LibraryItem }).item, ...current]);
      setTitle('');
      setContent('');
      setStatus('active');
      setMessage('记录已保存');
    } catch {
      setMessage('保存失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  function updateItem(item: LibraryItem): Promise<boolean> {
    const pending = saveQueue.current.then(async () => {
      try {
        if (!item.title.trim()) {
          setMessage('标题不能为空');
          return false;
        }
        const response = await fetch('/api/library', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            operation: 'update',
            title: item.title,
            content: item.content,
            status: item.status,
          }),
        });
        setMessage(response.ok ? '修改已保存' : '修改保存失败');
        return response.ok;
      } catch {
        setMessage('修改保存失败，内容仍留在当前页面，请重试后再离开');
        return false;
      }
    });
    saveQueue.current = pending;
    return pending;
  }

  async function deleteItem(id: string) {
    setBusy(true);
    try {
      const response = await fetch('/api/library', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, operation: 'delete' }),
      });
      if (!response.ok) throw new Error('删除失败');
      setItems((current) => current.filter((item) => item.id !== id));
      setMessage('记录已移至已删除');
    } catch {
      setMessage('删除失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function archiveToToday(item: LibraryItem) {
    setBusy(true);
    try {
      if (!(await updateItem(item))) throw new Error('保存失败');
      const response = await fetch('/api/library', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, operation: 'archive-today' }),
      });
      if (!response.ok) throw new Error('归档失败');
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage('已归入今天的思考，并从这里移除');
      await onArchived();
    } catch {
      setMessage('归入今日失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="collection-view">
      <SpaceHeading
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        count={items.length}
        countLabel="条记录"
        icon={Icon}
        tone={
          kind === 'learning' ? 'olive' : kind === 'insights' ? 'honey' : 'clay'
        }
      />

      <div className="collection-composer">
        <div className="composer-label">
          <Plus size={15} aria-hidden="true" />
          <h2>{config.action}</h2>
        </div>
        <label htmlFor="new-record-title" className="field-label">
          记录标题
        </label>
        <Input
          id="new-record-title"
          disabled={busy}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="collection-title-input"
          placeholder={config.titlePlaceholder}
          aria-label={config.titlePlaceholder}
        />
        <label htmlFor="new-record-content" className="field-label">
          详细内容
        </label>
        <Textarea
          id="new-record-content"
          disabled={busy}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="collection-content-input"
          placeholder={config.contentPlaceholder}
          aria-label={config.contentPlaceholder}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <output className="composer-message">
            {message || '内容会独立保存在这个空间'}
          </output>
          <div className="flex items-center gap-2">
            <NativeSelect
              disabled={busy}
              value={status}
              size="sm"
              aria-label="记录状态"
              onChange={(event) => setStatus(event.target.value as ItemStatus)}
            >
              {statusOptions.map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button onClick={createItem} disabled={!title.trim() || busy}>
              <Plus />
              {config.action}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold">
            {kind === 'insights' ? '待整理思考' : '全部记录'}
          </h2>
          <span className="h-px flex-1 bg-border" />
        </div>
        {loading && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            正在读取…
          </p>
        )}
        {!loading && items.length === 0 && (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed bg-card/40 text-center">
            <div>
              <Icon className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">这里还没有内容</p>
              <p className="mt-1 text-xs text-muted-foreground">
                新建记录或从收集箱归档
              </p>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} id={`record-${item.id}`} tabIndex={-1} className="collection-entry">
              <div className="flex items-start gap-3">
                <Input
                  disabled={busy}
                  value={item.title}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, title: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  onBlur={() => {
                    void updateItem(item);
                  }}
                  className="entry-title-input"
                  aria-label="记录标题"
                />
                {item.sourceInboxId && (
                  <span className="mt-1.5 rounded-full bg-accent px-2 py-1 text-[10px] text-accent-foreground">
                    来自收集箱
                  </span>
                )}
              </div>
              <Textarea
                disabled={busy}
                value={item.content}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, content: event.target.value }
                        : entry,
                    ),
                  )
                }
                onBlur={() => {
                  void updateItem(item);
                }}
                className="entry-content-input"
                placeholder="补充详细内容…"
                aria-label="记录正文"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <time className="text-[11px] text-muted-foreground">
                  更新于{' '}
                  {new Intl.DateTimeFormat('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(item.updatedAt))}
                </time>
                <div className="flex items-center gap-2">
                  {kind === 'insights' && item.status !== 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        void archiveToToday(item);
                      }}
                    >
                      <CalendarPlus />
                      归入今日
                    </Button>
                  )}
                  <NativeSelect
                    value={item.status}
                    size="sm"
                    aria-label="记录状态"
                    disabled={busy}
                    onChange={(event) => {
                      const updated = {
                        ...item,
                        status: event.target.value as ItemStatus,
                      };
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? updated : entry,
                        ),
                      );
                      void updateItem(updated);
                    }}
                  >
                    {statusOptions.map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除记录"
                    disabled={busy}
                    onClick={() => {
                      void deleteItem(item.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
