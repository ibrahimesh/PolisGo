import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { useRequestSignOut } from '../../auth/signOut';
import { useSettings } from '../../settings/SettingsProvider';
import { Button, ButtonLink } from '../ui/Button';
import { cx } from '../ui/cx';
import { ChevronDownIcon, CloseIcon, MenuIcon, SettingsIcon } from '../ui/icons';
import { usePopover } from '../ui/usePopover';
import { ConnectionBanner } from './ConnectionBanner';
import { LANDING_SECTIONS, PRIMARY_SECTIONS, SECONDARY_SECTIONS } from './navigation';
import type { LandingSection } from './navigation';
import { PaletteLauncher } from './PaletteLauncher';
import { usePaletteShortcut } from './usePaletteShortcut';
import { LogoLink } from './Wordmark';

const navLinkClass =
  'inline-flex h-9 items-center rounded-sm px-3 text-sm font-medium whitespace-nowrap text-muted transition-colors duration-(--duration-fast) hover:text-text';

// The public header holds only the logo, the section links, a compact search
// button and the account area. Nothing in it may wrap: from lg the first
// sections show and the rest sit under "More" until xl has room for all of
// them; below lg everything is in the menu panel. Header labels use the
// short names (nav.short) where a language's full name is long.
export function Header() {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const signOut = useRequestSignOut();
  const { openSettings } = useSettings();
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useMenuModality(headerRef, toggleRef, menuOpen, closeMenu);

  // Any navigation closes the mobile menu.
  const [lastLocation, setLastLocation] = useState(pathname + hash);
  if (lastLocation !== pathname + hash) {
    setLastLocation(pathname + hash);
    setMenuOpen(false);
  }

  // Escape closes the mobile menu (the palette shortcut hook forwards it).
  usePaletteShortcut(
    undefined,
    useCallback(() => {
      // Focus inside the panel would fall to <body> when it hides.
      if (headerRef.current?.querySelector(`[id="${menuId}"]`)?.contains(document.activeElement)) {
        toggleRef.current?.focus();
      }
      setMenuOpen(false);
    }, [menuId]),
  );

  const authed = status === 'authenticated' && user;
  const shortLabel = (section: LandingSection) => t(`nav.short.${section}`);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-line bg-bg [view-transition-name:site-header]"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <LogoLink className="mr-2 xl:mr-4" />

        <nav aria-label={t('nav.primary')} className="hidden min-w-0 items-center gap-1 lg:flex">
          {PRIMARY_SECTIONS.map((section) => (
            <Link key={section} to={`/#${section}`} className={navLinkClass}>
              {shortLabel(section)}
            </Link>
          ))}
          {SECONDARY_SECTIONS.map((section) => (
            <Link key={section} to={`/#${section}`} className={cx(navLinkClass, 'max-xl:hidden')}>
              {shortLabel(section)}
            </Link>
          ))}
          <MoreMenu />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <PaletteLauncher onOpen={() => setMenuOpen(false)} />

          <div className="hidden items-center gap-2 md:flex">
            {authed ? (
              <>
                <ButtonLink to="/app" size="sm" className="whitespace-nowrap">
                  {t('nav.workspace')}
                </ButtonLink>
                <Button variant="ghost" size="sm" onClick={signOut} className="whitespace-nowrap">
                  {t('nav.signOut')}
                </Button>
              </>
            ) : (
              <>
                <ButtonLink to="/login" variant="ghost" size="sm" className="whitespace-nowrap">
                  {t('nav.signIn')}
                </ButtonLink>
                <ButtonLink to="/register" size="sm" className="whitespace-nowrap">
                  {t('nav.register')}
                </ButtonLink>
              </>
            )}
          </div>

          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.menu')}
            className="grid size-9 place-items-center rounded-sm border border-line text-text lg:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      <ConnectionBanner />

      {/* Below lg: every section (full names), settings and the account. */}
      <div
        id={menuId}
        hidden={!menuOpen}
        className={cx(
          'border-t border-line bg-bg lg:hidden',
          menuOpen && 'max-h-[calc(100dvh-4rem)] overflow-y-auto',
        )}
      >
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <nav aria-label={t('nav.primary')} className="flex flex-col">
            {LANDING_SECTIONS.map((section) => (
              <Link key={section} to={`/#${section}`} className="border-b border-line py-3 text-lg">
                {t(`nav.${section}`)}
              </Link>
            ))}
            {authed && (
              <Link to="/app" className="border-b border-line py-3 text-lg">
                {t('nav.workspace')}
              </Link>
            )}
          </nav>
          <Button variant="secondary" onClick={openSettings}>
            <SettingsIcon />
            {t('settings.open')}
          </Button>
          <div className="flex flex-wrap gap-2 md:hidden">
            {authed ? (
              <Button variant="secondary" onClick={signOut}>
                {t('nav.signOut')}
              </Button>
            ) : (
              <>
                <ButtonLink to="/register">{t('nav.register')}</ButtonLink>
                <ButtonLink to="/login" variant="secondary">
                  {t('nav.signIn')}
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// The open menu covers the page below the header, so it behaves as a modal:
// the rest of the shell is inert (out of the Tab order and the accessibility
// tree; dialogs mount outside the shell and stay usable), Tab wraps inside the
// header, and reaching lg, where the panel is hidden, closes it so the page is
// never left inert behind nothing.
function useMenuModality(
  headerRef: RefObject<HTMLElement | null>,
  toggleRef: RefObject<HTMLButtonElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    const header = headerRef.current;
    const shell = header?.parentElement;
    if (!open || !header || !shell) return;

    const wide = window.matchMedia('(min-width: 64rem)');
    if (wide.matches) {
      close();
      return;
    }
    wide.addEventListener('change', close);

    const others = Array.from(shell.children).filter(
      (el): el is HTMLElement => el !== header && el instanceof HTMLElement && !el.inert,
    );
    for (const el of others) el.inert = true;

    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog opened from the menu (Settings, the palette) keeps its own Tab order.
      if (event.key !== 'Tab' || document.activeElement?.closest('dialog')) return;
      const focusable = Array.from(
        header.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select'),
      ).filter((el) => el.getClientRects().length > 0);
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!header.contains(document.activeElement)) {
        event.preventDefault();
        (toggleRef.current ?? first).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      wide.removeEventListener('change', close);
      for (const el of others) el.inert = false;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [headerRef, toggleRef, open, close]);
}

// lg–xl: the secondary sections behind a disclosure (not a menu: ordinary
// links, Tab works as usual, Escape returns to the button).
function MoreMenu() {
  const { t } = useTranslation();
  const popover = usePopover();
  return (
    <div className="relative xl:hidden">
      <button
        type="button"
        {...popover.buttonProps}
        onClick={popover.toggle}
        className={cx(navLinkClass, 'gap-1', popover.open && 'text-text')}
      >
        {t('nav.more')}
        <ChevronDownIcon />
      </button>
      <div
        {...popover.panelProps}
        className="absolute top-full left-0 z-50 mt-2 min-w-56 origin-top-left animate-pop-in rounded-sm border border-line-strong bg-surface p-2"
      >
        <ul>
          {SECONDARY_SECTIONS.map((section) => (
            <li key={section}>
              <Link
                to={`/#${section}`}
                onClick={() => popover.close()}
                className="flex min-h-10 items-center rounded-sm px-3 text-sm font-medium whitespace-nowrap text-text transition-colors duration-(--duration-fast) hover:bg-surface-2"
              >
                {t(`nav.${section}`)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
