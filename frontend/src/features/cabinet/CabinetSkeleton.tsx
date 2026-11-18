import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../components/ui/Skeleton';

// Suspense fallback for a cabinet route chunk. Same frame as PageHeader plus
// a content block, so the page doesn't jump when it lands.
export function CabinetSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="space-y-10 text-text">
      <span className="sr-only" role="status">
        {t('common.loading')}
      </span>
      <div className="space-y-4 border-b border-line pb-8">
        <Skeleton className="h-10 w-2/3 max-w-md" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
