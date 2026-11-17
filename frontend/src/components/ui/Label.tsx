import type { ReactNode } from 'react';
import { cx } from './cx';

interface LabelProps {
  children: ReactNode;
  className?: string;
  as?: 'span' | 'p' | 'div' | 'dt';
}

// Sentence-case caption: 14px, medium weight, muted. Replaces the v1 uppercase
// monospace labels, which read as decoration rather than information.
export function Label({ children, className, as: Tag = 'span' }: LabelProps) {
  return <Tag className={cx('text-sm font-medium text-muted', className)}>{children}</Tag>;
}
