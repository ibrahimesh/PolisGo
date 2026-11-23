import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { useCompleteSignOut } from '../../auth/signOut';
import { Footer } from './Footer';
import { Header } from './Header';
import { PageSkeleton } from './PageSkeleton';
import { useScrollOnNavigate } from './useScrollOnNavigate';

export function AppShell() {
  const { t } = useTranslation();
  useScrollOnNavigate();
  useCompleteSignOut();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('nav.skipToContent')}
      </a>
      <Header />
      {/* Routes are lazy chunks. The footer arrives with the page: shown
          under the short placeholder, it would jump away when the page
          lands (a layout shift of ~0.5 on the landing page). */}
      <Suspense
        fallback={
          <Main>
            <PageSkeleton />
          </Main>
        }
      >
        <Main>
          <Outlet />
        </Main>
        <Footer />
      </Suspense>
    </div>
  );
}

function Main({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="flex-1 outline-none">
      {children}
    </main>
  );
}
