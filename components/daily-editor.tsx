'use client';
import type { ReactNode } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  NotebookPen,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { localDate } from '@/lib/daily-note';
import type { DailyNote } from '@/lib/daily-note';
import { addDays } from '@/lib/actions';

export function DailyEditor({
  date,
  note,
  disabled,
  onChange,
  onOpenDate,
  children,
}: {
  date: string;
  note: DailyNote;
  disabled: boolean;
  onChange: (note: DailyNote) => void;
  onOpenDate: (date: string) => Promise<void>;
  children: ReactNode;
}) {
  const isToday = date === localDate();
  return (
    <>
      <div className="daily-heading">
        <div>
          <p className="eyebrow">每日记录</p>
          <h1>{isToday ? '今天的记录' : `${date} 的记录`}</h1>
        </div>
        <div className="date-controls">
          <button
            className="icon-control"
            title="前一天"
            aria-label="前一天"
            disabled={disabled}
            onClick={() => void onOpenDate(addDays(date, -1))}
          >
            <ChevronLeft size={16} />
          </button>
          <label className="date-picker">
            <CalendarDays size={14} />
            <input
              type="date"
              aria-label="笔记日期"
              value={date}
              disabled={disabled}
              onChange={(e) => {
                if (e.target.value) void onOpenDate(e.target.value);
              }}
            />
          </label>
          <button
            className="icon-control"
            title="后一天"
            aria-label="后一天"
            disabled={disabled}
            onClick={() => void onOpenDate(addDays(date, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {children}
      <fieldset
        disabled={disabled}
        className="journal-grid min-w-0 disabled:opacity-60"
      >
        <section className="journal-card" id="daily-body">
          <div className="journal-card-heading">
            <span className="section-icon tone-olive">
              <BookOpen size={18} />
            </span>
            <h2>工作与学习</h2>
          </div>
          <Textarea
            id="daily-body-input"
            value={note.body}
            onChange={(e) => onChange({ ...note, body: e.target.value })}
            aria-label="工作与学习记录"
            className="journal-textarea body-textarea"
            placeholder="记录今天的进展、理解与问题…"
          />
          <div className="writing-footer">
            <span>
              <NotebookPen size={12} />
              工作与学习
            </span>
            <span>{Array.from(note.body.replace(/\s/g, '')).length} 字</span>
          </div>
        </section>
        <section className="journal-card" id="daily-thought">
          <div className="journal-card-heading">
            <span className="section-icon tone-honey">
              <Lightbulb size={18} />
            </span>
            <h2>此刻的思考</h2>
          </div>
          <Textarea
            value={note.thought}
            onChange={(e) => onChange({ ...note, thought: e.target.value })}
            aria-label="今日思考"
            className="journal-textarea thought-textarea"
            placeholder="一个想法，一个仍在思考的问题…"
          />
        </section>
      </fieldset>
    </>
  );
}
