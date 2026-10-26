'use client';
import { useImperativeHandle, useState } from 'react';
import type { Ref } from 'react';
import {
  Check,
  ChevronDown,
  Clock3,
  CornerDownRight,
  ExternalLink,
  MoreHorizontal,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActionPool } from '@/hooks/use-action-pool';
import { addDays } from '@/lib/actions';
import type { ProjectedAction } from '@/lib/actions';
import { localDate } from '@/lib/daily-note';
import type { SaveParticipant } from '@/lib/save-participant';

export function ActionPool({
  date,
  handle,
  beforeWrite,
  onState,
  onSource,
  focusId,
}: {
  date: string;
  handle: Ref<SaveParticipant>;
  beforeWrite: () => Promise<boolean>;
  onState: (status: string) => void;
  onSource: (date: string, id: string) => void;
  focusId: string | null;
}) {
  const pool = useActionPool(date, beforeWrite, onState);
  useImperativeHandle(handle, () => ({
    flush: pool.flush,
    dirty: pool.dirty,
    exportText: pool.exportText,
  }));
  const [deferId, setDeferId] = useState<string | null>(null);
  const [deferDate, setDeferDate] = useState(addDays(localDate(), 1));
  const disabled = pool.busy || !pool.restored || !pool.canEdit;

  function row(a: ProjectedAction, carry = false) {
    const editable = !disabled && a.status !== 'unknown';
    const open = ['pending', 'today', 'deferred'].includes(a.status);
    return (
      <div
        key={a.id}
        id={`action-${a.id}`}
        tabIndex={-1}
        className={`action-row is-${a.status} ${focusId === a.id ? 'is-focused' : ''}`}
      >
        <div className="action-row-main">
          <label className="action-check-wrap">
            <input
              type="checkbox"
              checked={a.status === 'completed'}
              className={`action-check ${a.status === 'completed' ? 'is-complete' : ''}`}
              title={
                a.status === 'unknown'
                  ? '历史状态未知'
                  : a.status === 'completed'
                    ? '撤销完成'
                    : '完成行动'
              }
              aria-label={`${a.status === 'completed' ? '撤销完成' : '完成行动'}：${a.content}`}
              disabled={!editable || (!open && a.status !== 'completed')}
              onChange={() =>
                void pool.mutate(
                  a.id,
                  a.status === 'completed' ? 'undo' : 'complete',
                  a.version,
                )
              }
            />
            <Check size={13} className="action-check-mark" aria-hidden="true" />
          </label>
          <Input
            value={pool.drafts.edits[a.id]?.content ?? a.content}
            aria-label={`行动内容：${a.content}`}
            readOnly={!editable}
            onChange={(e) => pool.edit(a.id, e.target.value, a.version)}
            className="action-content"
            maxLength={4000}
          />
          {carry && pool.canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="action-include"
              disabled={disabled}
              onClick={() => void pool.mutate(a.id, 'include', a.version)}
            >
              <CornerDownRight />
              <span>纳入今天</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              className="action-menu-trigger"
              title="更多操作"
              aria-label={`更多操作：${a.content}`}
              disabled={pool.busy}
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="action-menu">
              {open && pool.canEdit && (
                <>
                  {!(a.status === 'today' && a.scheduledDate === date) && (
                    <DropdownMenuItem
                      disabled={disabled}
                      onClick={() =>
                        void pool.mutate(a.id, 'include', a.version)
                      }
                    >
                      <CornerDownRight />
                      纳入今天
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={disabled}
                    onClick={() =>
                      void pool.mutate(
                        a.id,
                        'defer',
                        a.version,
                        addDays(localDate(), 1),
                      )
                    }
                  >
                    <Clock3 />
                    延期到明天
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={disabled}
                    onClick={() => {
                      setDeferDate(addDays(localDate(), 1));
                      setDeferId(a.id);
                    }}
                  >
                    <Clock3 />
                    选择延期日期
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={disabled}
                    onClick={() => void pool.mutate(a.id, 'abandon', a.version)}
                  >
                    <X />
                    放弃
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {a.status === 'completed' && pool.canEdit && (
                <DropdownMenuItem
                  disabled={disabled}
                  onClick={() => void pool.mutate(a.id, 'undo', a.version)}
                >
                  <RotateCcw />
                  撤销完成
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                title={`来源 ${a.sourceDate}${a.scheduledDate ? `；安排 ${a.scheduledDate}` : ''}`}
                onClick={() => onSource(a.sourceDate, a.id)}
              >
                <ExternalLink />
                查看来源
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {deferId === a.id && (
          <div className="action-defer">
            <label>
              延期至{' '}
              <input
                aria-label="延期日期"
                type="date"
                min={addDays(localDate(), 1)}
                value={deferDate}
                onChange={(e) => setDeferDate(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              disabled={disabled || !deferDate || deferDate <= localDate()}
              onClick={() =>
                void pool
                  .mutate(a.id, 'defer', a.version, deferDate)
                  .then((ok) => {
                    if (ok) setDeferId(null);
                  })
              }
            >
              确定
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="取消延期"
              title="取消延期"
              onClick={() => setDeferId(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </div>
    );
  }
  const carryover = [
    ...new Map((pool.data?.carryover ?? []).map((a) => [a.id, a])).values(),
  ];
  const carryIds = new Set(carryover.map((a) => a.id));
  const items = [
    ...new Map(
      [...(pool.data?.items ?? []), ...(pool.data?.future ?? [])].map((a) => [
        a.id,
        a,
      ]),
    ).values(),
  ].filter((a) => !carryIds.has(a.id));
  const current = items.filter((a) =>
    ['pending', 'today', 'unknown'].includes(a.status),
  );
  const completed = items.filter((a) => a.status === 'completed');
  const deferred = items.filter((a) => a.status === 'deferred');
  const abandoned = items.filter((a) => a.status === 'abandoned');

  function composer(schedule: 'today' | 'tomorrow') {
    return (
      pool.canEdit && (
        <form
          className={`action-composer ${schedule === 'tomorrow' ? 'action-tomorrow-composer' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            void pool.flush();
          }}
        >
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            title="添加行动"
            aria-label="添加行动"
            disabled={disabled || !pool.drafts[schedule].trim()}
          >
            {schedule === 'tomorrow' ? (
              <Clock3 size={16} />
            ) : (
              <Plus size={16} />
            )}
          </Button>
          <Input
            disabled={disabled}
            value={pool.drafts[schedule]}
            aria-label={schedule === 'today' ? '新建今日行动' : '新建明日行动'}
            placeholder={
              schedule === 'today'
                ? '添加一条今天的行动...'
                : '添加一条明天的行动...'
            }
            maxLength={4000}
            onChange={(e) => pool.compose(schedule, e.target.value)}
          />
        </form>
      )
    );
  }

  return (
    <section className="action-pool" aria-label="每日行动">
      {pool.error && (
        <div className="action-error" role="alert">
          <p>{pool.error}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pool.busy}
              onClick={() => void pool.retry()}
            >
              <RotateCcw />
              重试保存
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pool.busy}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([pool.exportText()], {
                    type: 'text/markdown;charset=utf-8',
                  }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = `${date}-行动草稿.md`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                void pool.reconcile();
              }}
            >
              导出草稿并重新读取
            </Button>
          </div>
        </div>
      )}
      {!pool.data && <p className="action-empty">正在读取行动…</p>}
      {carryover.length > 0 && (
        <section className="action-carryover" aria-label="待承接行动">
          <h2>
            待承接 <span>{carryover.length}</span>
          </h2>
          {carryover.map((a) => row(a, true))}
        </section>
      )}
      <section className="action-section">
        <h2>{date === localDate() ? '今日行动' : '当日行动'}</h2>
        {current.map((a) => row(a))}
        {pool.data && current.length === 0 && !pool.canEdit && (
          <p className="action-empty">暂无行动</p>
        )}
        {composer('today')}
        {completed.length > 0 && (
          <details className="action-secondary action-completed">
            <summary>
              <ChevronDown size={13} />
              已完成 <span>{completed.length}</span>
            </summary>
            {completed.map((a) => row(a))}
          </details>
        )}
        {deferred.length + abandoned.length > 0 && (
          <details className="action-secondary action-deferred">
            <summary>
              <ChevronDown size={13} />
              已放弃 / 延期 <span>{deferred.length + abandoned.length}</span>
            </summary>
            {deferred.length > 0 && (
              <div className="action-secondary-group" aria-label="延期行动">
                <h3>延期</h3>
                {deferred.map((a) => row(a))}
              </div>
            )}
            {abandoned.length > 0 && (
              <div className="action-secondary-group" aria-label="已放弃行动">
                <h3>已放弃</h3>
                {abandoned.map((a) => row(a))}
              </div>
            )}
          </details>
        )}
        {composer('tomorrow')}
      </section>
    </section>
  );
}
