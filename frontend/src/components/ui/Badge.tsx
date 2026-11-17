import type { ReactNode } from 'react';
import { cx } from './cx';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'paper';

const tones: Record<Tone, string> = {
  neutral: 'border-line-strong text-muted',
  accent: 'border-accent/60 text-accent',
  success: 'border-success/60 text-success',
  warning: 'border-warning/60 text-warning',
  danger: 'border-danger/60 text-danger',
  paper: 'border-paper-line text-paper-ink',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-7 items-center gap-2 rounded-sm border px-2 text-sm font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
