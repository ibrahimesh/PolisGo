import { cx } from './cx';

// Decorative placeholder; the surrounding region announces loading via aria-busy.
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx('skeleton block rounded-sm bg-current/10', className)} />
  );
}
