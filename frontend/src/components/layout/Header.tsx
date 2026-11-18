import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { useRequestSignOut } from '../../auth/signOut';
import { Button, ButtonLink } from '../ui/Button';
import { cx } from '../ui/cx';
import { CloseIcon, MenuIcon, SearchIcon } from '../ui/icons';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { ThemeToggle } from '../ui/ThemeToggle';
import { CommandPalette } from './CommandPalette';
import { LANDING_SECTIONS } from './navigation';
import { isMac, usePaletteShortcut } from './usePaletteShortcut';
import { Wordmark } from './Wordmark';

export function Header() {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const signOut = useRequestSignOut();
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuId = useId();

  // Any navigation closes the mobile menu.
  const [lastLocation, setLastLocation] = useState(pathname + hash);
  if (lastLocation !== pathname + hash) {
    setLastLocation(pathname + hash);
    setMenuOpen(false);
  }

  usePaletteShortcut(
    useCallback(() => setPaletteOpen(true), []),
    useCallback(() => setMenuOpen(false), []),
  );

  const authed = status === 'authenticated' && user;
  const navLinkClass =
    'rounded-sm px-3 py-2 text-sm font-medium text-muted transition-colors duration-150 hover:text-text';

  const sectionLinks = LANDING_SECTIONS.map((section) => (
    <Link key={section} to={`/#${section}`} className={navLinkClass}>
      {t(`nav.${section}`)}
    </Link>
  ));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label={t('app.home')} className="mr-4 shrink-0 rounded-sm">
          <Wordmark />
        </Link>

        <nav aria-label={t('nav.primary')} className="hidden items-center gap-1 lg:flex">
          {sectionLinks}
          {authed && (
            <Link to="/app" className={navLinkClass}>
              {t('nav.workspace')}
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            className="flex h-9 items-center gap-2 rounded-sm border border-line px-3 text-sm text-muted transition-colors hover:text-text"
          >
            <SearchIcon />
            {/* Visible shortcut text must be part of the accessible name (WCAG 2.5.3). */}
            <span className="sr-only">{t('palette.open')}</span>
            <kbd className="hidden font-sans sm:inline">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>

          <div
            role="group"
            aria-label={t('nav.settings')}
            className="hidden items-center gap-2 xl:flex"
          >
            <LanguageSwitcher />
            <ThemeToggle />
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {authed ? (
              <Button variant="secondary" size="sm" onClick={signOut}>
                {t('nav.signOut')}
              </Button>
            ) : (
              <>
                <ButtonLink to="/login" variant="ghost" size="sm">
                  {t('nav.signIn')}
                </ButtonLink>
                <ButtonLink to="/register" size="sm">
                  {t('nav.register')}
                </ButtonLink>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.menu')}
            className="grid size-9 place-items-center rounded-sm border border-line text-text xl:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Below xl: section links (below lg), settings and account in one panel. */}
      <div
        id={menuId}
        hidden={!menuOpen}
        className={cx(
          'border-t border-line bg-bg xl:hidden',
          menuOpen && 'max-h-[calc(100dvh-4rem)] overflow-y-auto',
        )}
      >
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <nav aria-label={t('nav.primary')} className="flex flex-col lg:hidden">
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
          <div
            role="group"
            aria-label={t('nav.settings')}
            className="flex flex-wrap items-center gap-4"
          >
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
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

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
