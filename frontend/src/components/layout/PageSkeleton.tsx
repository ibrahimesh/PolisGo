import { useTranslation } from 'react-i18next';
import { Skeleton } from '../ui/Skeleton';
import { Frame } from './Section';

// Suspense fallback while a route chunk downloads. Mirrors the page frame
// (label, display heading, lead) so the layout doesn't jump when it lands.
export function PageSkeleton() {
  const { t } = useTranslation();
  return (
    <Frame>
      <div aria-busy="true" className="space-y-6 px-6 py-16 text-text sm:px-8 lg:py-24">
        <span className="sr-only" role="status">
          {t('common.loading')}
        </span>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-14 w-full max-w-2xl" />
        <Skeleton className="h-14 w-2/3 max-w-xl" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
    </Frame>
  );
}
