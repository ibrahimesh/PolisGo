import type { ReactNode } from 'react';
import { cx } from '../ui/cx';

// Full-bleed hairline frame with a centred content column.
export function Frame({
  children,
  className,
  id,
  labelledBy,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
  as?: 'div' | 'section';
}) {
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      className={cx('scroll-mt-24 border-b border-line', className)}
    >
      <div className="mx-auto max-w-7xl">{children}</div>
    </Tag>
  );
}

interface HeadingProps {
  lead: ReactNode;
  accent?: ReactNode;
  as?: 'h1' | 'h2';
  id?: string;
  size?: 'display' | 'section';
  children?: ReactNode;
  className?: string;
}

// "Lead *accent.*" pattern: roman serif lead, italic accent in the accent
// colour. No eyebrow labels: the heading carries the section on its own.
export function AccentHeading({
  lead,
  accent,
  as: Tag = 'h2',
  id,
  size = 'section',
  children,
  className,
}: HeadingProps) {
  return (
    <div className={cx('space-y-6', className)}>
      <Tag
        id={id}
        className={cx(
          'tracking-[-0.02em]',
          size === 'display'
            ? 'text-2xl sm:text-3xl xl:text-4xl'
            : 'text-xl sm:text-2xl lg:text-3xl',
        )}
      >
        {lead}
        {accent && (
          <>
            {' '}
            <em className="text-accent">{accent}</em>
          </>
        )}
      </Tag>
      {children}
    </div>
  );
}
