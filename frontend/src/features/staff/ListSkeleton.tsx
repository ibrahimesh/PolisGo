import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../components/ui/Skeleton';

// Placeholder rows shaped like the staff lists, so the page doesn't jump
// when the data arrives.
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="divide-y divide-line border-y border-line">
      <span className="sr-only" role="status">
        {t('common.loading')}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 py-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="hidden h-5 w-40 md:block" />
          <Skeleton className="hidden h-5 w-24 md:block" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}
