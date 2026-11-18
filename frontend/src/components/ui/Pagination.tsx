import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

// Previous / next with "Page 2 of 5" between: lists are short and filtered,
// so numbered pages would add controls without saving clicks.
export function Pagination({
  page,
  pages,
  label,
  onChange,
}: {
  page: number;
  pages: number;
  label: string;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={label}
      className="flex items-center justify-between gap-4 border-t border-line pt-4"
    >
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeftIcon />
        {t('policies.previous')}
      </Button>
      <p className="text-sm text-muted tabular">{t('policies.pageOf', { page, pages })}</p>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        {t('policies.next')}
        <ChevronRightIcon />
      </Button>
    </nav>
  );
}
