import { Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { useScrollOnNavigate } from '../../components/layout/useScrollOnNavigate';
import { sectionsFor } from '../workspace/sections';
import { BottomNav } from './BottomNav';
import { CabinetHeader } from './CabinetHeader';
import { CabinetSkeleton } from './CabinetSkeleton';
import { Sidebar } from './Sidebar';

// Layout of the signed-in area: sidebar on desktop, bottom bar on phones,
// and a header with the palette, settings and the user menu. Rendered inside
// <RequireAuth>, so a user is always present.
export function CabinetShell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  useScrollOnNavigate();
  useFocusMainOnNavigate(mainRef);

  if (!user) return null;
  const sections = sectionsFor(user.role);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('nav.skipToContent')}
      </a>

      <Sidebar sections={sections} />

      <div className="flex min-h-dvh min-w-0 flex-col">
        <CabinetHeader />
        {/* Bottom padding clears the fixed phone bar. */}
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 px-4 pt-8 pb-28 outline-none sm:px-6 lg:px-10 lg:pt-12 lg:pb-16"
        >
          <div className="mx-auto max-w-6xl">
            <Suspense fallback={<CabinetSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <BottomNav sections={sections.filter((section) => section.mobile)} />
    </div>
  );
}

// A client-side route change is silent for screen readers; moving focus to
// <main> (not the first visit) puts them at the top of the new page.
function useFocusMainOnNavigate(mainRef: React.RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname, mainRef]);
}
