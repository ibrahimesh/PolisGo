import type { ReactNode } from 'react';
import { cx } from '../ui/cx';

interface PageHeaderProps {
  title: ReactNode;
  // Italic accent phrase after the title, as in the landing headlines.
  accent?: ReactNode;
  description?: ReactNode;
  // Rendered above the title, e.g. a "back to list" link.
  before?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

// Heading block for signed-in pages: a serif h1 sized for a working screen
// (40px, 28px on phones), not the 64-96px of the landing page.
export function PageHeader({
  title,
  accent,
  description,
  before,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cx(
        'flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-3">
        {before}
        <h1 className="text-xl tracking-[-0.02em] break-words sm:text-2xl">
          {title}
          {accent && (
            <>
              {' '}
              <em className="text-accent">{accent}</em>
            </>
          )}
        </h1>
        {description && <p className="max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
