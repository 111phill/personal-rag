'use client';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { addDays, weekStart } from '@/lib/actions';
import { localDate } from '@/lib/daily-note';
import { reviewGroups, weeklyMarkdown } from '@/lib/weekly-review';
import type { WeeklyReview as Review, ReviewSource } from '@/lib/weekly-review';
import type { SaveParticipant } from '@/lib/save-participant';

function texts(r: Review) {
  return JSON.stringify([r.gains, r.blockers, r.nextFocus]);
}
export function WeeklyReview({
  handle,
  onSource,
  onActionSource,
}: {
  handle: Ref<SaveParticipant>;
  onSource: (source: ReviewSource) => void;
  onActionSource: (date: string, id: string) => void;
}) {
  const [week, setWeek] = useState(() => weekStart(localDate()));
  const [review, setReview] = useState<Review | null>(null);
  const current = useRef<Review | null>(null);
  const saved = useRef('');
  const [savedText, setSavedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const flight = useRef<Promise<boolean> | null>(null);
  const key = `weekly-draft:v1:${week}`;
  const dirty = () =>
    !!current.current && texts(current.current) !== saved.current;
  function put(r: Review) {
    current.current = r;
    setReview(r);
  }
  useEffect(() => {
    let ignore = false;
    void Promise.resolve()
      .then(() => {
        if (ignore) return;
        current.current = null;
        setReview(null);
        setError('');
        setMessage('');
        return fetch(`/api/reviews/weekly?weekStart=${week}`, {
          cache: 'no-store',
        })
          .then(async (response) => {
            const body = (await response.json()) as Review & { error?: string };
            if (!response.ok) throw new Error(body.error);
            return body;
          })
          .then((body) => {
            if (ignore) return;
            saved.current = texts(body);
            setSavedText(saved.current);
            try {
              const raw = sessionStorage.getItem(key);
              if (raw) {
                const d = JSON.parse(raw) as {
                  gains: string;
                  blockers: string;
                  nextFocus: string;
                  version: number | null;
                };
                if (
                  !['gains', 'blockers', 'nextFocus'].every(
                    (k) => typeof d[k as keyof typeof d] === 'string',
                  )
                )
                  throw new Error();
                body = { ...body, ...d };
              }
            } catch {
              setError('复盘草稿无法读取，请勿清理浏览器数据');
            }
            put(body);
          });
      })
      .catch((e) => {
        if (!ignore) setError(e.message ?? '复盘读取失败');
      });
    return () => {
      ignore = true;
    };
  }, [week, key]);
  const save = (refreshSummary = false): Promise<boolean> => {
    if (flight.current) return flight.current;
    const work = async () => {
      const r = current.current;
      if (!r) return false;
      setBusy(true);
      setError('');
      setMessage('');
      try {
        const response = await fetch('/api/reviews/weekly', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStart: week,
            gains: r.gains,
            blockers: r.blockers,
            nextFocus: r.nextFocus,
            expectedVersion: r.version,
            refreshSummary,
          }),
        });
        const body = (await response.json()) as Review & { error?: string };
        if (!response.ok) throw new Error(body.error);
        put(body);
        saved.current = texts(body);
        setSavedText(saved.current);
        sessionStorage.removeItem(key);
        setMessage(refreshSummary ? '汇总已更新' : '复盘已保存');
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
  const flush = () =>
    flight.current ?? (dirty() ? save() : Promise.resolve(true));
  useImperativeHandle(handle, () => ({
    flush,
    dirty,
    exportText: () => (current.current ? weeklyMarkdown(current.current) : ''),
  }));
  function edit(field: 'gains' | 'blockers' | 'nextFocus', value: string) {
    const r = { ...current.current!, [field]: value };
    put(r);
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          gains: r.gains,
          blockers: r.blockers,
          nextFocus: r.nextFocus,
          version: r.version,
        }),
      );
    } catch {
      setError('草稿备份失败，请保存后再关闭页面');
    }
    setMessage('');
  }
  async function move(start: string) {
    if (await flush()) setWeek(start);
  }
  function download() {
    if (!current.current) return;
    const url = URL.createObjectURL(
      new Blob([weeklyMarkdown(current.current)], {
        type: 'text/markdown;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${week}-周复盘.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reloadVersion() {
    download();
    try {
      const response = await fetch(`/api/reviews/weekly?weekStart=${week}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      const latest = (await response.json()) as Review;
      const old = current.current;
      if (!old) {
        put(latest);
        saved.current = texts(latest);
        setSavedText(saved.current);
      } else {
        saved.current = texts(latest);
        setSavedText(saved.current);
        const r = {
          ...latest,
          gains: old.gains,
          blockers: old.blockers,
          nextFocus: old.nextFocus,
        };
        put(r);
        sessionStorage.setItem(
          key,
          JSON.stringify({
            gains: r.gains,
            blockers: r.blockers,
            nextFocus: r.nextFocus,
            version: r.version,
          }),
        );
      }
      setError('');
    } catch {
      setError('重新读取失败，草稿仍保留');
    }
  }
  return (
    <section className="weekly-review">
      <div className="daily-heading">
        <div>
          <p className="eyebrow">每周回顾</p>
          <h1>周复盘</h1>
          <p className="review-period">
            {week} 至 {addDays(week, 6)}
          </p>
        </div>
        <div className="date-controls">
          <Button
            variant="ghost"
            size="icon"
            title="上一周"
            aria-label="上一周"
            disabled={busy || !review}
            onClick={() => void move(addDays(week, -7))}
          >
            <ChevronLeft />
          </Button>
          <input
            type="date"
            aria-label="复盘所在周"
            value={week}
            max={localDate()}
            disabled={busy || !review}
            onChange={(e) => {
              if (e.target.value) void move(weekStart(e.target.value));
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            title="下一周"
            aria-label="下一周"
            disabled={busy || !review || week >= weekStart(localDate())}
            onClick={() => void move(addDays(week, 7))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="review-toolbar">
        <output aria-live="polite">
          {busy
            ? '正在保存…'
            : review && texts(review) !== savedText
              ? '待保存'
              : message || (review?.version ? '已保存' : '尚未保存')}
        </output>
        <div>
          <Button
            variant="ghost"
            size="icon"
            title="导出 Markdown"
            aria-label="导出周复盘 Markdown"
            disabled={!review || busy}
            onClick={download}
          >
            <ArrowDownToLine />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!review || busy}
            onClick={() => void save(true)}
          >
            <RefreshCw />
            更新汇总
          </Button>
          <Button
            size="sm"
            disabled={!review || busy}
            onClick={() => void save()}
          >
            <Save />
            保存复盘
          </Button>
        </div>
      </div>
      {error && (
        <div role="alert" className="action-error">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void reloadVersion()}
          >
            导出草稿并重新读取
          </Button>
        </div>
      )}
      {!review && <p className="action-empty">正在读取复盘…</p>}
      {review && (
        <>
          <div className="review-fields">
            {(
              [
                ['gains', '本周收获'],
                ['blockers', '阻塞问题'],
                ['nextFocus', '下周重点'],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label htmlFor={`review-${field}`}>{label}</label>
                <Textarea
                  id={`review-${field}`}
                  value={review[field]}
                  disabled={busy}
                  maxLength={10000}
                  onChange={(e) => edit(field, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="review-summary">
            <h2>行动回顾</h2>
            {reviewGroups.map((group) => {
              const items = review.snapshot.actions.filter((a) =>
                (group.statuses as readonly string[]).includes(a.status),
              );
              return (
                <section key={group.label} className="review-group">
                  <h3>
                    {group.label}
                    <span>{items.length}</span>
                  </h3>
                  {items.length === 0 ? (
                    <p className="action-empty">无</p>
                  ) : (
                    items.map((a) => (
                      <div
                        key={a.id}
                        className={`review-action is-${a.status}`}
                      >
                        <div>
                          <p>{a.content}</p>
                          <div className="action-row-meta">
                            {a.undoneThisWeek && (
                              <span className="action-status">
                                本周撤销过完成
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={`来源 ${a.sourceDate}${a.scheduledDate ? `；安排 ${a.scheduledDate}` : ''}${a.status === 'completed' ? (a.completedAt ? `；完成 ${new Date(a.completedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}` : '；完成时间未知') : ''}`}
                          aria-label={`查看行动来源：${a.content}`}
                          onClick={() => onActionSource(a.sourceDate, a.id)}
                        >
                          <ExternalLink />
                        </Button>
                      </div>
                    ))
                  )}
                </section>
              );
            })}
          </div>
          <div className="review-summary">
            <h2>每日与工作学习摘要</h2>
            {review.snapshot.sources.length === 0 ? (
              <p className="action-empty">本周暂无记录</p>
            ) : (
              review.snapshot.sources.map((s) => (
                <article key={`${s.kind}-${s.id}`} className="review-source">
                  <div>
                    <span>
                      {s.date} ·{' '}
                      {s.kind === 'daily'
                        ? '每日记录'
                        : s.kind === 'work'
                          ? '工作'
                          : '学习'}
                    </span>
                    <h3>{s.title}</h3>
                    <p>{s.excerpt}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="打开原记录"
                    aria-label={`打开原记录：${s.title}`}
                    onClick={() => onSource(s)}
                  >
                    <ExternalLink />
                  </Button>
                </article>
              ))
            )}
          </div>
          <p className="review-generated">
            汇总时间{' '}
            {new Date(review.snapshot.generatedAt).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
            })}
          </p>
        </>
      )}
    </section>
  );
}
