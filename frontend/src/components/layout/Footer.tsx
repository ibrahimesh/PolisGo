import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { healthApi } from '../../api/endpoints';
import { isApiError } from '../../api/errors';
import { cx } from '../ui/cx';
import { Label } from '../ui/Label';
import { Wordmark } from './Wordmark';

type Health = 'checking' | 'healthy' | 'degraded' | 'unhealthy';

// Live read of the API's /health probe — a small, honest signal that the
// page is wired to a real backend.
function useApiHealth(): Health {
  const query = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => healthApi.check(signal),
    refetchInterval: 30_000,
    retry: false,
  });

  if (query.isPending) return 'checking';
  if (query.isError) {
    // 503 means the API answered but a dependency (the database) is down.
    return isApiError(query.error) && query.error.status === 503 ? 'degraded' : 'unhealthy';
  }
  return query.data.trim() === 'Healthy' ? 'healthy' : 'degraded';
}

const dot: Record<Health, string> = {
  checking: 'bg-muted',
  healthy: 'bg-success',
  degraded: 'bg-warning',
  unhealthy: 'bg-danger',
};

export function Footer() {
  const { t } = useTranslation();
  const health = useApiHealth();

  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-7xl divide-y divide-line border-line md:grid-cols-3 md:divide-x md:divide-y-0 xl:border-x">
        <div className="space-y-4 px-6 py-10">
          <Wordmark />
          <p className="max-w-xs text-sm leading-relaxed text-muted">{t('footer.about')}</p>
        </div>

        <div className="space-y-4 px-6 py-10">
          <Label as="p">{t('footer.statusLabel')}</Label>
          <p className="flex items-center gap-2.5 text-sm" role="status">
            <span aria-hidden="true" className={cx('size-2 rounded-full', dot[health])} />
            <span className="label-mono text-muted">{t('footer.api')}</span>
            <span>{t(`footer.status.${health}`)}</span>
          </p>
          <p className="text-sm text-muted">{t('footer.currency')}</p>
        </div>

        <div className="space-y-4 px-6 py-10">
          <Label as="p">{t('footer.legalLabel')}</Label>
          <p className="text-sm leading-relaxed text-muted">{t('footer.legal')}</p>
          <p className="label-mono text-muted">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
