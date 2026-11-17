import type { ReactNode } from 'react';
import { cx } from './cx';
import { Label } from './Label';

interface EmptyStateProps {
  label?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  headingLevel?: 'h1' | 'h2' | 'h3';
}

export function EmptyState({
  label,
  title,
  body,
  action,
  className,
  headingLevel: Heading = 'h2',
}: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-start gap-5 py-12', className)}>
      <EmptyGlyph />
      {label && <Label>{label}</Label>}
      <Heading className="max-w-xl text-3xl">{title}</Heading>
      {body && <p className="max-w-lg leading-relaxed text-muted">{body}</p>}
      {action}
    </div>
  );
}

// Wireframe "empty frame": a square with its diagonal, nothing inside.
function EmptyGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="size-12 text-accent" aria-hidden="true">
      <rect x="0.5" y="0.5" width="47" height="47" fill="none" stroke="currentColor" opacity=".6" />
      <path d="M0.5 47.5 47.5 0.5" stroke="currentColor" opacity=".35" />
      <circle cx="24" cy="24" r="10" fill="none" stroke="currentColor" opacity=".35" />
    </svg>
  );
}
