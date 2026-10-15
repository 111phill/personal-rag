import type { LucideIcon } from 'lucide-react';

export function SpaceHeading({
  eyebrow,
  title,
  description,
  count,
  countLabel,
  icon: Icon,
  tone,
}: {
  eyebrow: string;
  title: string;
  description: string;
  count: number;
  countLabel: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className={`space-hero space-hero-${tone}`}>
      <div>
        <p className="eyebrow">
          <Icon size={15} aria-hidden="true" />
          {eyebrow}
        </p>
        <h1>{title}</h1>
        <p className="hero-description">{description}</p>
        <span className="space-count">
          {count} {countLabel}
        </span>
      </div>
      <div className="space-hero-icon" aria-hidden="true">
        <Icon size={54} strokeWidth={1.2} />
      </div>
    </div>
  );
}
