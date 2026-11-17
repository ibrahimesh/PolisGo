import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router';
import { Footer } from './Footer';
import { Header } from './Header';
import { PageSkeleton } from './PageSkeleton';

export function AppShell() {
  const { t } = useTranslation();
  useScrollOnNavigate();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('nav.skipToContent')}
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {/* Routes are lazy chunks; the shell stays put while one loads. */}
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

const HASH_WAIT_MS = 3000;

// SPA navigations don't reset scroll; honour #hash targets, otherwise go to
// top. The target may live in a route chunk that hasn't rendered yet, so
// wait (briefly) for it to appear.
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const scroll = () => {
      const target = document.getElementById(id);
      target?.scrollIntoView();
      return target !== null;
    };
    if (scroll()) return;

    const observer = new MutationObserver(() => {
      if (scroll()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = setTimeout(() => observer.disconnect(), HASH_WAIT_MS);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [pathname, hash]);
}
