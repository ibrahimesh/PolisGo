import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router';
import { LogoLink } from '../../components/layout/Wordmark';
import { cx } from '../../components/ui/cx';
import { ArrowLeftIcon } from '../../components/ui/icons';
import type { WORKSPACE_SECTIONS } from '../workspace/sections';
import { SECTION_ICONS } from './sectionIcons';

type Section = (typeof WORKSPACE_SECTIONS)[number];

// Desktop navigation. The active item carries an accent rule on its left
// edge as well as a fill, so the state never rests on colour alone. The rule
// is one element that slides to the active item (transform only); until it
// has measured (or without JS) each active item draws its own.
export function Sidebar({ sections }: { sections: readonly Section[] }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const listRef = useRef<HTMLUListElement>(null);
  const ruleRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const rule = ruleRef.current;
    if (!list || !rule) return;
    const place = () => {
      const active = list.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) {
        rule.style.opacity = '0';
        return;
      }
      // The first placement jumps; later ones slide (the class adds the
      // transition only once the rule is in place).
      rule.style.opacity = '1';
      rule.style.height = `${String(active.offsetHeight - 16)}px`;
      rule.style.transform = `translateY(${String(active.offsetTop + 8)}px)`;
      if (!list.dataset.ready) requestAnimationFrame(() => (list.dataset.ready = 'true'));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [pathname, sections]);

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line [view-transition-name:cabinet-sidebar] lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-6">
        <LogoLink />
      </div>

      <nav aria-label={t('cabinet.nav')} className="flex-1 overflow-y-auto px-3 py-6">
        <ul ref={listRef} className="group/nav relative space-y-1">
          <span
            ref={ruleRef}
            aria-hidden="true"
            data-testid="sidebar-rule"
            className="pointer-events-none absolute top-0 left-0 z-10 w-0.5 bg-accent opacity-0 group-data-[ready]/nav:transition-transform group-data-[ready]/nav:duration-(--duration-base) group-data-[ready]/nav:ease-institutional"
          />
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
                        ? 'bg-surface-2 text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-accent group-data-[ready]/nav:before:hidden'
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
