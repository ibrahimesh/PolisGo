import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { unstable_HistoryRouter as HistoryRouter, useLocation } from 'react-router';
import { createTransitionHistory, settleViewTransition } from './viewTransitions';

const history = createTransitionHistory();

function ViewTransitionCommit() {
  const location = useLocation();
  useLayoutEffect(() => settleViewTransition(location.key), [location.key]);
  return null;
}

// BrowserRouter with page transitions (see viewTransitions.ts).
export function MotionRouter({ children }: { children: ReactNode }) {
  return (
    <HistoryRouter history={history}>
      <ViewTransitionCommit />
      {children}
    </HistoryRouter>
  );
}
