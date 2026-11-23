import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { LogoLink } from '../../components/layout/Wordmark';
import { cx } from '../../components/ui/cx';
import { ArrowLeftIcon } from '../../components/ui/icons';
import type { WORKSPACE_SECTIONS } from '../workspace/sections';
import { SECTION_ICONS } from './sectionIcons';

type Section = (typeof WORKSPACE_SECTIONS)[number];

// Desktop navigation. The active item carries an accent rule on its left
// edge as well as a fill, so the state never rests on colour alone.
export function Sidebar({ sections }: { sections: readonly Section[] }) {
  const { t } = useTranslation();

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-6">
        <LogoLink />
      </div>

      <nav aria-label={t('cabinet.nav')} className="flex-1 overflow-y-auto px-3 py-6">
        <ul className="space-y-1">
          {sections.map((section) => {
            const Icon = SECTION_ICONS[section.id];
            return (
              <li key={section.id}>
                <NavLink
                  to={section.path}
                  end={section.id === 'overview'}
                  className={({ isActive }) =>
                    cx(
                      'relative flex min-h-10 items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-surface-2 text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-accent'
                        : 'text-muted hover:bg-surface-2 hover:text-text',
                    )
                  }
                >
                  <Icon />
                  {t(`workspace.sections.${section.id}`)}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line px-6 py-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-sm text-sm text-muted transition-colors hover:text-text"
        >
          <ArrowLeftIcon />
          {t('cabinet.backToSite')}
        </Link>
      </div>
    </aside>
  );
}
