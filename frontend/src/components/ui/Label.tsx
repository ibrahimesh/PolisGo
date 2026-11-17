import type { ReactNode } from 'react';
import { cx } from './cx';

interface LabelProps {
  children: ReactNode;
  className?: string;
  as?: 'span' | 'p' | 'div';
}

// Small uppercase mono label — the "caption" voice of the design system.
export function Label({ children, className, as: Tag = 'span' }: LabelProps) {
  return <Tag className={cx('label-mono text-muted', className)}>{children}</Tag>;
}
