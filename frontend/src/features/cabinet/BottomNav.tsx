import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { cx } from '../../components/ui/cx';
import type { WORKSPACE_SECTIONS } from '../workspace/sections';
import { SECTION_ICONS } from './sectionIcons';

type Section = (typeof WORKSPACE_SECTIONS)[number];

// Literal classes so Tailwind can see them; sections.ts caps the bar at five.
const COLUMNS = ['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'];

// Phone navigation: a fixed bar within thumb reach. Short labels keep RU and
// AZ on one line at 390px; the accent rule marks the current section.
export function BottomNav({ sections }: { sections: readonly Section[] }) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('cabinet.nav')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className={cx('grid', COLUMNS[sections.length])}>
        {sections.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          return (
            <li key={section.id} className="min-w-0">
              <NavLink
                to={section.path}
                end={section.id === 'overview'}
                className={({ isActive }) =>
                  cx(
                    'relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-sm transition-colors duration-150',
                    isActive
                      ? 'font-medium text-text before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:bg-accent'
                      : 'text-muted hover:text-text',
                  )
                }
              >
                <Icon />
                <span className="max-w-full truncate">{t(`workspace.short.${section.id}`)}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
