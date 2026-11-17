import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { healthApi } from '../../api/endpoints';
import { isApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import { cx } from '../ui/cx';
import { LANDING_SECTIONS } from './navigation';
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

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="font-sans text-sm font-medium tracking-normal text-muted">{title}</h2>
      {children}
    </div>
  );
}

const linkClass = 'text-text hover:text-accent transition-colors duration-150';

export function Footer() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const health = useApiHealth();

  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-12 lg:px-8">
        <div className="space-y-4 md:col-span-4">
          <Wordmark />
          <p className="max-w-xs text-muted">{t('footer.about')}</p>
        </div>

        <div className="grid gap-12 sm:grid-cols-3 md:col-span-8">
          <Column title={t('footer.product')}>
            <ul className="space-y-2">
              {LANDING_SECTIONS.map((section) => (
                <li key={section}>
                  <Link to={`/#${section}`} className={linkClass}>
                    {t(`nav.${section}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </Column>

          <Column title={t('footer.account')}>
            <ul className="space-y-2">
              {status === 'authenticated' ? (
                <li>
                  <Link to="/app" className={linkClass}>
                    {t('nav.workspace')}
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/login" className={linkClass}>
                      {t('nav.signIn')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" className={linkClass}>
                      {t('nav.register')}
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </Column>

          <Column title={t('footer.statusLabel')}>
            <p className="flex items-center gap-2" role="status">
              <span aria-hidden="true" className={cx('size-2 rounded-full', dot[health])} />
              {t('footer.api')} · {t(`footer.status.${health}`)}
            </p>
            <p className="text-sm text-muted">{t('footer.currency')}</p>
          </Column>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:px-6 md:flex-row md:justify-between lg:px-8">
          <p>{t('footer.legal')}</p>
          <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
