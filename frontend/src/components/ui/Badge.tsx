import type { ReactNode } from 'react';
import { cx } from './cx';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'paper';

const tones: Record<Tone, string> = {
  neutral: 'border-line-strong text-muted',
  accent: 'border-accent/50 text-accent',
  success: 'border-success/50 text-success',
  warning: 'border-warning/50 text-warning',
  danger: 'border-danger/50 text-danger',
  paper: 'border-paper-accent/40 text-paper-accent',
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
        'inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 label-mono whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
