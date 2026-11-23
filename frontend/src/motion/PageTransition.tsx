import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { supportsViewTransitions } from './viewTransitions';

const native = typeof document !== 'undefined' && supportsViewTransitions();

// Where the browser has View Transitions, the router animates the page and
// this renders its children as they are. Elsewhere a new pathname remounts a
// wrapper with a short fade-up (reduced motion ends it at once).
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (native) return children;
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
