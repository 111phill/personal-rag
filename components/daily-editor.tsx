'use client';

import { ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Lightbulb, NotebookPen, Plus, Sun, Target, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { localDate } from '@/lib/daily-note';
import type { DailyNote, Goal } from '@/lib/daily-note';

export function DailyEditor({ date, note, disabled, onChange, onOpenDate }: { date: string; note: DailyNote; disabled: boolean; onChange: (note: DailyNote) => void; onOpenDate: (date: string) => Promise<void> }) {
  const isToday = date === localDate();
  const completed = note.goals.filter((goal) => goal.completed).length;
  const wordCount = Array.from(`${note.body}${note.thought}`.replace(/\s/g, '')).length;
  function moveDate(offset: number) {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    void onOpenDate(value.toISOString().slice(0, 10));
  }
  return (
    <>
      <div className="daily-hero">
        <div className="hero-copy">
          <p className="eyebrow"><Sun size={15} aria-hidden="true" /> 每一天，都是新的积累</p>
          <h1>{isToday ? '今天，也值得记录。' : '翻开这一天的记录。'}</h1>
          <p className="hero-description">记录工作，收藏新知，让想法在这里慢慢生长。</p>
          <span className="hero-date">{new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`))}</span>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="art-orbit" /><div className="art-sun"><Sun size={25} strokeWidth={1.3} /></div><div className="art-notebook"><NotebookPen size={62} strokeWidth={1.1} /></div><span className="art-caption">a little, every day.</span></div>
      </div>
      <div className="daily-stats" aria-label="当前笔记概览">
        <div><span className="stat-icon tone-clay"><Target size={18} aria-hidden="true" /></span><div><p>目标完成</p><strong>{disabled ? '—' : completed}<span> / {disabled ? '—' : note.goals.length}</span></strong></div></div>
        <div><span className="stat-icon tone-olive"><NotebookPen size={18} aria-hidden="true" /></span><div><p>记录字数</p><strong>{disabled ? '—' : wordCount}<span> 字</span></strong></div></div>
        <div><span className="stat-icon tone-honey"><ArrowRight size={18} aria-hidden="true" /></span><div><p>下一步行动</p><strong>{disabled ? '—' : note.actions.filter((action) => !action.completed).length}<span> 项待办</span></strong></div></div>
      </div>
      <div className="journal-toolbar">
        <div className="section-label"><span className="tiny-dot" />{isToday ? '今日手记' : '每日手记'}<span className="toolbar-caption">DAILY JOURNAL</span></div>
        <div className="date-controls"><button className="icon-control" aria-label="前一天" disabled={disabled} onClick={() => moveDate(-1)}><ChevronLeft size={16} /></button><label className="date-picker"><CalendarDays size={14} aria-hidden="true" /><input type="date" aria-label="笔记日期" value={date} disabled={disabled} onChange={(event) => { if (event.target.value) void onOpenDate(event.target.value); }} /></label><button className="icon-control" aria-label="后一天" disabled={disabled} onClick={() => moveDate(1)}><ChevronRight size={16} /></button></div>
      </div>
      <fieldset disabled={disabled} className="journal-grid min-w-0 disabled:opacity-60">
        <NoteSection id="daily-goals" title="今日目标" subtitle="让重要的事，先发生" marker="01" icon={Target} tone="clay" extra={<span className="section-count">{completed} / {note.goals.length}</span>}><Checklist items={note.goals} label="目标" addLabel="添加一个小目标" onChange={(goals) => onChange({ ...note, goals })} /></NoteSection>
        <NoteSection id="daily-body" title="工作与学习" subtitle="今天做了什么，又学到了什么？" marker="02" icon={BookOpen} tone="olive"><Textarea id="daily-body-input" value={note.body} onChange={(event) => onChange({ ...note, body: event.target.value })} aria-label="工作与学习记录" className="journal-textarea body-textarea" placeholder={'从一件小事开始写起…\n项目的进展、新学到的知识，或一次值得记住的交流。'} /><div className="writing-footer"><span><NotebookPen size={12} aria-hidden="true" />自由书写，慢慢积累</span><span>{Array.from(note.body.replace(/\s/g, '')).length} 字</span></div></NoteSection>
        <div className="journal-bottom-grid">
          <NoteSection id="daily-thought" title="此刻的思考" subtitle="给灵感留一个位置" marker="03" icon={Lightbulb} tone="honey"><Textarea value={note.thought} onChange={(event) => onChange({ ...note, thought: event.target.value })} aria-label="今日思考" className="journal-textarea thought-textarea" placeholder="一个新想法，一个仍在思考的问题…" /></NoteSection>
          <NoteSection id="daily-actions" title="明日行动" subtitle="给明天的自己一点方向" marker="04" icon={ArrowRight} tone="clay"><Checklist items={note.actions} label="行动" addLabel="添加下一步行动" onChange={(actions) => onChange({ ...note, actions })} /></NoteSection>
        </div>
      </fieldset>
      <p className="journal-signoff">不必每一天都很精彩，但每一点积累都算数。<span>✦</span></p>
    </>
  );
}

function Checklist({ items, label, addLabel, onChange }: { items: Goal[]; label: string; addLabel: string; onChange: (items: Goal[]) => void }) {
  return <div className="checklist">
    {items.length === 0 && <p className="checklist-empty">{label === '目标' ? '从一个小目标，开启这一天。' : '把想做的事，留给明天。'}</p>}
    {items.map((item) => <div key={item.id} className={`checklist-row group ${item.completed ? 'is-complete' : ''}`}><label className="check-control"><input type="checkbox" checked={item.completed} aria-label={`完成${label}：${item.text || '未命名'}`} onChange={(event) => onChange(items.map((entry) => entry.id === item.id ? { ...entry, completed: event.target.checked } : entry))} /><span aria-hidden="true">{item.completed && <Check size={12} strokeWidth={3} />}</span></label><Input value={item.text} aria-label={`${label}内容`} placeholder={`输入一个${label}`} className="checklist-input" onChange={(event) => onChange(items.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry))} /><Button variant="ghost" size="icon-sm" aria-label={`删除${label}`} className="checklist-delete" onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}><Trash2 size={14} /></Button></div>)}
    <button className="add-item" type="button" onClick={() => onChange([...items, { id: crypto.randomUUID(), text: '', completed: false }])}><Plus size={16} aria-hidden="true" />{addLabel}</button>
  </div>;
}

function NoteSection({ id, title, subtitle, marker, icon: Icon, tone, extra, children }: { id: string; title: string; subtitle: string; marker: string; icon: LucideIcon; tone: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return <section id={id} className="journal-card" aria-labelledby={`${id}-heading`}><div className="journal-card-heading"><span className={`section-icon tone-${tone}`}><Icon size={18} aria-hidden="true" /></span><div><h2 id={`${id}-heading`}>{title}</h2><p>{subtitle}</p></div>{extra}<span className="section-number">{marker}</span></div><div className="journal-card-content">{children}</div></section>;
}
