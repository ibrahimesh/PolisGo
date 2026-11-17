import { cx } from './cx';

// Decorative placeholder; the surrounding region announces loading via aria-busy.
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'block animate-pulse rounded-sm bg-current/10 motion-reduce:animate-none',
        className,
      )}
    />
  );
}
