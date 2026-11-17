import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { Button, ButtonLink } from '../ui/Button';
import { cx } from '../ui/cx';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useToast } from '../ui/ToastProvider';
import { Wordmark } from './Wordmark';

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'label-mono px-3 py-2 transition-colors duration-150',
    isActive ? 'text-text' : 'text-muted hover:text-text',
  );

export function Header() {
  const { t } = useTranslation();
  const { status, user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const signOutPending = useRef(false);

  const finishSignOut = useCallback(() => {
    signOutPending.current = false;
    logout();
    toast({ title: t('auth.signedOut'), tone: 'info' });
  }, [logout, toast, t]);

  // Sign-out is two steps: leave the protected route, then drop the session.
  // Clearing first lets the route guard re-render while still mounted and
  // bounce the user to /login. Navigation is a transition, so wait until the
  // home route has actually committed before logging out.
  useEffect(() => {
    if (signOutPending.current && pathname === '/') finishSignOut();
  }, [pathname, finishSignOut]);

  function signOut() {
    if (pathname === '/') {
      finishSignOut();
      return;
    }
    signOutPending.current = true;
    void navigate('/');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] border-line lg:grid-cols-3 xl:border-x">
        <div className="flex items-center px-4 sm:px-6">
          <Link to="/" aria-label={t('app.home')} className="rounded-sm">
            <Wordmark />
          </Link>
        </div>

        <nav
          aria-label={t('nav.primary')}
          className="hidden items-center justify-center gap-1 border-x border-line lg:flex"
        >
          <Link to="/#calculator" className={navLink({ isActive: false })}>
            {t('nav.calculator')}
          </Link>
          <Link to="/#method" className={navLink({ isActive: false })}>
            {t('nav.method')}
          </Link>
          {status === 'authenticated' && (
            <NavLink to="/app" className={navLink}>
              {t('nav.workspace')}
            </NavLink>
          )}
        </nav>

        <div className="flex items-center justify-end gap-2 px-4 sm:gap-3 sm:px-6">
          <div
            role="group"
            aria-label={t('nav.settings')}
            className="hidden items-center gap-2 md:flex"
          >
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          {status === 'authenticated' && user ? (
            <>
              <ButtonLink to="/app" variant="ghost" size="sm" className="lg:hidden">
                {t('nav.workspace')}
              </ButtonLink>
              <Button variant="secondary" size="sm" onClick={signOut}>
                {t('nav.signOut')}
              </Button>
            </>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost" size="sm">
                {t('nav.signIn')}
              </ButtonLink>
              <ButtonLink
                to="/register"
                variant="primary"
                size="sm"
                className="hidden sm:inline-flex"
              >
                {t('nav.register')}
              </ButtonLink>
            </>
          )}
        </div>
      </div>
      {/* Settings stay reachable on small screens in a slim second row. */}
      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2 md:hidden">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
