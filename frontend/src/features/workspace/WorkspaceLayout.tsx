import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { Frame } from '../../components/layout/Section';
import { cx } from '../../components/ui/cx';
import { Label } from '../../components/ui/Label';
import { sectionsFor } from './sections';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'block border-l px-4 py-2 text-sm transition-colors duration-150',
    isActive ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
  );

export function WorkspaceLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Frame>
      <div className="grid min-h-[70dvh] lg:grid-cols-[16rem_1fr] lg:divide-x lg:divide-line">
        <nav
          aria-label={t('workspace.sectionsLabel')}
          className="space-y-4 border-b border-line px-6 py-10 lg:border-b-0"
        >
          <Label as="p">{t('workspace.sectionsLabel')}</Label>
          <ul className="space-y-1">
            <li>
              <NavLink to="/app" end className={linkClass}>
                {t('workspace.sections.overview')}
              </NavLink>
            </li>
            {sectionsFor(user.role).map((section) => (
              <li key={section.id}>
                <NavLink to={section.path} className={linkClass}>
                  {t(`workspace.sections.${section.id}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="px-6 py-10 sm:px-8 lg:py-14">
          <Outlet />
        </div>
      </div>
    </Frame>
  );
}
