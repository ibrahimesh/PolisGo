import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cx } from '../ui/cx';

// Original mark: a framed square cut by a diagonal and a vertical — a policy
// "document" reduced to hairlines. Deliberately not shield- or crest-shaped.
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        viewBox="0 0 24 24"
        className="size-6 text-accent transition-transform duration-(--duration-base) ease-institutional group-hover/logo:-rotate-6 motion-reduce:transition-none motion-reduce:group-hover/logo:rotate-0"
        aria-hidden="true"
      >
        <rect
          x="2.75"
          y="2.75"
          width="18.5"
          height="18.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M2.75 21.25 21.25 2.75M12 2.75v18.5"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
      <span className="font-serif text-lg tracking-[-0.02em] whitespace-nowrap">
        Polis
        <em className="inline-block text-accent transition-transform duration-(--duration-base) ease-institutional group-hover/logo:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/logo:translate-x-0">
          Go
        </em>
      </span>
    </span>
  );
}

// The logo in every shell goes to the landing page, as users expect of a
// logo; the cabinet's own home is the first sidebar item.
export function LogoLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      aria-label={t('app.home')}
      data-testid="logo-link"
      className={cx('group/logo shrink-0 rounded-sm focus-visible:outline-offset-4', className)}
    >
      <Wordmark />
    </Link>
  );
}
