import type { ProjectedAction } from './actions.ts';
import { actionMarkdown } from './actions.ts';

export type ReviewAction = ProjectedAction & { undoneThisWeek: boolean };
export type ReviewSource = {
  id: string;
  kind: 'daily' | 'work' | 'learning';
  date: string;
  title: string;
  excerpt: string;
};
export type WeekSnapshot = {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  actions: ReviewAction[];
  sources: ReviewSource[];
};
export type WeeklyReview = {
  weekStart: string;
  gains: string;
  blockers: string;
  nextFocus: string;
  snapshot: WeekSnapshot;
  version: number | null;
};
export const reviewGroups = [
  { label: '完成', statuses: ['completed'] },
  { label: '未完成', statuses: ['pending', 'today'] },
  { label: '延期', statuses: ['deferred'] },
  { label: '放弃', statuses: ['abandoned'] },
] as const;
export function weeklyMarkdown(review: WeeklyReview) {
  const { snapshot } = review;
  const sections = [
    `# 周复盘 ${snapshot.weekStart} 至 ${snapshot.weekEnd}`,
    `汇总生成时间：${snapshot.generatedAt}`,
  ];
  for (const group of reviewGroups) {
    const items = snapshot.actions.filter((a) =>
      (group.statuses as readonly string[]).includes(a.status),
    );
    sections.push(
      `## ${group.label}\n${items.map((a) => `${actionMarkdown([a])}${a.completedAt ? `；完成 ${a.completedAt}` : a.status === 'completed' ? '；完成时间未知' : ''}${a.undoneThisWeek ? '；本周撤销过完成' : ''}`).join('\n') || '无'}`,
    );
  }
  sections.push(
    `## 每日与工作学习摘要\n${snapshot.sources.map((s) => `### ${s.date} ${s.title}\n${s.excerpt}\n来源：${s.kind}/${s.id}`).join('\n\n') || '无'}`,
  );
  for (const [title, text] of [
    ['本周收获', review.gains],
    ['阻塞问题', review.blockers],
    ['下周重点', review.nextFocus],
  ])
    sections.push(`## ${title}\n${text}`);
  return sections.join('\n\n');
}
