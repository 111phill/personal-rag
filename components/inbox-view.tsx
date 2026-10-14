'use client';
import { useEffect, useRef, useState } from 'react';
import { Inbox, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
type InboxItem = {
  id: string;
  content: string;
  status: 'pending';
  archivedTo: null;
  createdAt: string;
};

type ArchiveTarget =
  | 'today'
  | 'today-thoughts'
  | 'work'
  | 'learning'
  | 'insights';

export function InboxView({ onArchived }: { onArchived: () => Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));

  useEffect(() => {
    let cancelled = false;
    fetch('/api/inbox')
      .then((response) => {
        if (!response.ok) throw new Error('读取失败');
        return response.json();
      })
      .then((data: unknown) => {
        if (!cancelled) {
          setItems((data as { items: InboxItem[] }).items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage('收集箱读取失败，请稍后重试');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createItem() {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error('保存失败');
      setItems((current) => [(data as { item: InboxItem }).item, ...current]);
      setDraft('');
      setMessage('已保存到收集箱');
    } catch {
      setMessage('保存失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  function updateItem(item: InboxItem): Promise<boolean> {
    const pending = saveQueue.current.then(async () => {
      try {
        if (!item.content.trim()) return false;
        const response = await fetch('/api/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            operation: 'update',
            content: item.content,
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

  async function removeItem(
    id: string,
    operation: 'delete' | 'archive',
    target?: ArchiveTarget,
  ) {
    setBusy(true);
    setMessage('');
    try {
      if (operation === 'archive') {
        const latest = items.find((item) => item.id === id);
        if (!latest || !(await updateItem(latest))) throw new Error('保存失败');
      }
      const response = await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, operation, target }),
      });
      if (!response.ok) throw new Error('操作失败');
      setItems((current) => current.filter((item) => item.id !== id));
      setMessage(operation === 'delete' ? '记录已移至已删除' : '记录已归档');
      if (operation === 'archive') await onArchived();
    } catch {
      setMessage('操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">
        快速收集
      </p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
            收集箱
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
            先记录，不分类。整理时再归档到真正属于它的位置。
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
          {items.length} 条待整理
        </span>
      </div>

      <div className="mt-9 rounded-2xl border bg-card p-5 shadow-sm">
        <Textarea
          disabled={busy}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-28 resize-none border-0 bg-transparent px-0 text-[15px] leading-7 shadow-none focus-visible:ring-0"
          placeholder="记录一个想法、链接或待办…"
          aria-label="快速记录"
        />
        <div className="mt-3 flex items-center justify-between border-t pt-4">
          <span className="text-xs text-muted-foreground">
            {message || '无需现在决定它属于哪里'}
          </span>
          <Button onClick={createItem} disabled={!draft.trim() || busy}>
            <Plus />
            保存到收集箱
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold">待整理</h2>
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
              <Inbox className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">收集箱是空的</p>
              <p className="mt-1 text-xs text-muted-foreground">
                新的想法会出现在这里
              </p>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border bg-card p-4 shadow-sm"
            >
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
                className="min-h-20 resize-none border-0 bg-transparent px-0 leading-7 shadow-none focus-visible:ring-0"
                aria-label="收集内容"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <time className="text-[11px] text-muted-foreground">
                  {new Intl.DateTimeFormat('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(item.createdAt))}
                </time>
                <div className="flex items-center gap-2">
                  <NativeSelect
                    value=""
                    size="sm"
                    aria-label="归档位置"
                    disabled={busy}
                    onChange={(event) => {
                      const target = event.target.value as ArchiveTarget;
                      void removeItem(item.id, 'archive', target);
                    }}
                  >
                    <NativeSelectOption value="" disabled>
                      归档到…
                    </NativeSelectOption>
                    <NativeSelectOption value="today">
                      今日记录
                    </NativeSelectOption>
                    <NativeSelectOption value="today-thoughts">
                      今日思考
                    </NativeSelectOption>
                    <NativeSelectOption value="work">工作</NativeSelectOption>
                    <NativeSelectOption value="learning">
                      学习
                    </NativeSelectOption>
                    <NativeSelectOption value="insights">
                      思考
                    </NativeSelectOption>
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除收集内容"
                    disabled={busy}
                    onClick={() => {
                      void removeItem(item.id, 'delete');
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
