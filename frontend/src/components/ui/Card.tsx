import type { HTMLAttributes } from 'react';
import { cx } from './cx';

type CardVariant = 'surface' | 'paper';

interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  as?: 'div' | 'section' | 'article';
}

const variants: Record<CardVariant, string> = {
  surface: 'bg-surface text-text border border-line',
  // White data card on navy: the brightest object on the page, so data reads first.
  paper: 'bg-paper text-paper-ink border border-paper-line',
};

export function Card({ variant = 'surface', as: Tag = 'div', className, ...rest }: CardProps) {
  return <Tag className={cx('rounded-sm', variants[variant], className)} {...rest} />;
}
