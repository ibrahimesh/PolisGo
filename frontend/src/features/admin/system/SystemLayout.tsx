import './systemI18n';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router';
import { PageHeader } from '../../../components/layout/PageHeader';
import { cx } from '../../../components/ui/cx';

const TABS = [
  { id: 'overview', to: '/app/admin/system' },
  { id: 'errors', to: '/app/admin/system/errors' },
] as const;

// The System section: one header, two views as links (each a URL, the
// current one announced with aria-current), the view below.
export function SystemLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current = pathname.startsWith('/app/admin/system/errors') ? 'errors' : 'overview';

  return (
    <div className="space-y-8">
      <PageHeader title={t('admin.system.title')} description={t('admin.system.lead')} />
      <nav aria-label={t('admin.system.tabsLabel')}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <Link
                to={tab.to}
                aria-current={current === tab.id ? 'page' : undefined}
                className={cx(
                  'inline-flex min-h-10 items-center rounded-sm border px-4 text-sm font-medium transition-colors duration-(--duration-fast)',
                  current === tab.id
                    ? 'border-accent bg-surface-2 text-text'
                    : 'border-line-strong text-muted hover:bg-surface-2 hover:text-text',
                )}
              >
                {t(`admin.system.tabs.${tab.id}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
