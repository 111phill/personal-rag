'use client';

import { useState } from 'react';
import { ArrowUpRight, BookOpen, CalendarDays, ChevronRight, FileText, FolderKanban, Inbox, Lightbulb, NotebookPen, Plus, Search, ShieldCheck, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { displayDate, localDate } from '@/lib/daily-note';
import type { NoteSummary } from '@/lib/daily-note';

export const navigation = [
  { key: 'today', label: '今日记录', icon: CalendarDays },
  { key: 'inbox', label: '收集箱', icon: Inbox },
  { key: 'work', label: '工作记录', icon: FolderKanban },
  { key: 'learning', label: '学习空间', icon: BookOpen },
  { key: 'insights', label: '思考与灵感', icon: Lightbulb },
] as const;
export type ViewKey = (typeof navigation)[number]['key'];

function sidebarDateLabel(date: string) {
  const today = localDate();
  const yesterdayDate = new Date(`${today}T12:00:00Z`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  if (date === today) return '今天';
  if (date === yesterdayDate.toISOString().slice(0, 10)) return '昨天';
  return displayDate(date);
}

export function NoteSidebar({ selectedDate, activeView, query, recentNotes, onQuery, onOpenDate, onNavigate, mobile = false }: { selectedDate: string; activeView: ViewKey; query: string; recentNotes: NoteSummary[]; onQuery: (query: string) => void; onOpenDate: (date: string) => Promise<void>; onNavigate: (view: ViewKey) => Promise<void>; mobile?: boolean }) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  return <aside className={`note-sidebar ${mobile ? 'is-mobile' : ''}`} aria-label="知识库侧栏">
    <div className="brand"><span className="brand-mark"><BookOpen size={22} strokeWidth={1.7} aria-hidden="true" /></span><div><p>我的知识库<span className="brand-dot">.</span></p><span>记录 · 连接 · 生长</span></div></div>
    <div className="sidebar-search"><Search size={16} aria-hidden="true" /><Input id={mobile ? 'mobile-note-search' : 'note-search'} value={query} onChange={(event) => onQuery(event.target.value)} aria-label="搜索知识库" placeholder="寻找一个想法…" /></div>
    <Button className="new-note-button" onClick={() => { void onNavigate('today'); }}><Plus size={17} aria-hidden="true" />写下今天<NotebookPen size={16} className="ml-auto" aria-hidden="true" /></Button>
    <p className="nav-label">我的空间<span>WORKSPACE</span></p>
    <nav className="space-nav" aria-label="主要导航">{navigation.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => { void onNavigate(key); }} aria-current={activeView === key ? 'page' : undefined} className={`space-nav-item ${activeView === key ? 'is-active' : ''}`}><Icon size={18} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span>{activeView === key && <ChevronRight size={14} aria-hidden="true" />}</button>)}</nav>
    <div className="recent-heading"><h2>{query ? '搜索结果' : '最近手记'}</h2><button className="icon-control" aria-label="选择日期" aria-expanded={datePickerOpen} onClick={() => setDatePickerOpen((open) => !open)}><Plus size={16} /></button></div>
    {datePickerOpen && <Input type="date" value={selectedDate} aria-label="打开指定日期" className="sidebar-date-input" onChange={(event) => { if (!event.target.value) return; void onOpenDate(event.target.value); setDatePickerOpen(false); }} />}
    <div className="recent-notes">{recentNotes.length === 0 && <div className="recent-empty"><FileText size={21} strokeWidth={1.4} aria-hidden="true" /><p>{query ? '没有找到相关笔记' : '故事从第一篇手记开始'}</p><span>{query ? '试试其他关键词' : '保存后，你的记录会出现在这里'}</span></div>}{recentNotes.map((item) => <button key={item.date} onClick={() => { void onOpenDate(item.date); }} aria-current={selectedDate === item.date && activeView === 'today' ? 'date' : undefined} className={`recent-note ${selectedDate === item.date && activeView === 'today' ? 'is-selected' : ''}`}><FileText size={16} aria-hidden="true" /><span><strong>{sidebarDateLabel(item.date)}</strong><small>{item.date}</small></span><span className="note-dot" /></button>)}</div>
    <div className="sidebar-bottom"><div className="grow-card"><Sprout size={22} strokeWidth={1.6} aria-hidden="true" /><p>让知识，慢慢长成你的样子。</p><span>每一次记录，都是一颗种子。</span></div><div className="local-space"><span className="local-avatar">我</span><div><strong>我的个人空间</strong><span><ShieldCheck size={11} aria-hidden="true" /> 本地知识库</span></div><ArrowUpRight size={15} aria-hidden="true" /></div></div>
  </aside>;
}
