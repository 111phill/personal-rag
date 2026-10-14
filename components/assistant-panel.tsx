import { ArrowDownToLine, ArrowRight, BookOpen, Check, Lightbulb, NotebookPen, Sparkles, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DailyNote } from '@/lib/daily-note';
import type { ViewKey } from '@/components/note-sidebar';

export function AssistantPanel({ note, activeView, ready, onExport }: { note: DailyNote; activeView: ViewKey; ready: boolean; onExport: () => void }) {
  const completed = note.goals.filter((goal) => goal.completed).length;
  const progress = note.goals.length ? Math.round(completed / note.goals.length * 100) : 0;
  return <aside className="companion-panel" aria-label="记录助手与笔记概览">
    <div className="companion-heading"><Sparkles size={17} aria-hidden="true" /><span>与你一起，把想法理清</span></div>
    <div className="assistant-card"><div className="assistant-top"><span className="assistant-symbol"><Sparkles size={23} strokeWidth={1.4} aria-hidden="true" /></span><span className="coming-badge">即将相遇</span></div><h2>你的灵感小助手</h2><p>让零散的记录产生连接。<br />陪你整理思考，发现新的可能。</p><div className="assistant-capabilities"><span><Check size={13} aria-hidden="true" /> 梳理记录中的关键想法</span><span><Check size={13} aria-hidden="true" /> 串联相关的历史笔记</span><span><Check size={13} aria-hidden="true" /> 从思考中找到下一步</span></div><Button disabled className="assistant-disabled"><Sparkles size={14} aria-hidden="true" /> 小助手尚未接入</Button></div>
    {activeView === 'today' && <><section className="overview-card"><div className="aside-section-title"><h2>今日目标进度</h2><span>{ready ? `${completed} / ${note.goals.length}` : '—'}</span></div><div className="progress-track" role="progressbar" aria-label="今日目标完成进度" aria-valuenow={ready ? progress : 0} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${ready ? progress : 0}%` }} /></div><p>{!ready ? '正在读取你的记录…' : note.goals.length === 0 ? '写下一个小目标，就是好的开始。' : progress === 100 ? '今天的目标都完成了，给自己一点肯定。' : `已完成 ${progress}%，按照自己的节奏前进。`}</p></section><section className="journal-outline"><div className="aside-section-title"><h2>这篇手记</h2><BookOpen size={15} aria-hidden="true" /></div>{[{ id: 'daily-goals', label: '今日目标', icon: Target }, { id: 'daily-body', label: '工作与学习', icon: NotebookPen }, { id: 'daily-thought', label: '此刻的思考', icon: Lightbulb }, { id: 'daily-actions', label: '明日行动', icon: ArrowRight }].map(({ id, label, icon: Icon }) => <a href={`#${id}`} key={id}><Icon size={15} aria-hidden="true" /><span>{label}</span><ArrowRight size={12} aria-hidden="true" /></a>)}<button className="export-note-link" disabled={!ready} onClick={onExport}><ArrowDownToLine size={15} aria-hidden="true" />导出为 Markdown</button></section></>}
    <div className="writing-prompt"><span className="eyebrow">留一点时间给自己</span><p>今天有什么事，<br />让你有了新的理解？</p><span className="prompt-line" /><small>一个好问题，也是一份收获。</small></div>
    <p className="companion-footer">YOUR THOUGHTS, CONNECTED.</p>
  </aside>;
}
