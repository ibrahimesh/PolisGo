import type { ReactNode } from 'react';
import { cx } from '../ui/cx';
import { Label } from '../ui/Label';

// Full-bleed hairline frame with a centred, side-ruled content column.
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('border-b border-line', className)}>
      <div className="mx-auto max-w-7xl border-line xl:border-x">{children}</div>
    </div>
  );
}

interface HeadingProps {
  label: ReactNode;
  lead: ReactNode;
  accent: ReactNode;
  as?: 'h1' | 'h2';
  id?: string;
  size?: 'display' | 'section';
  children?: ReactNode;
}

// "Lead *accent.*" heading pattern from DESIGN.md: roman lead, italic accent.
export function AccentHeading({
  label,
  lead,
  accent,
  as: Tag = 'h2',
  id,
  size = 'section',
  children,
}: HeadingProps) {
  return (
    <div className="space-y-5">
      <Label as="p">{label}</Label>
      <Tag
        id={id}
        className={cx(
          'leading-[1.02]',
          size === 'display'
            ? 'text-[clamp(2.75rem,6vw,5rem)]'
            : 'text-[clamp(2.25rem,4vw,3.25rem)]',
        )}
      >
        {lead} <em className="text-accent">{accent}</em>
      </Tag>
      {children}
    </div>
  );
}
