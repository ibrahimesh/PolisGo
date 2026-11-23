import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { UserRole } from '../api/types';
import { Skeleton } from '../components/ui/Skeleton';
import { classifyError } from '../pages/errors/errorKind';
import { ErrorPage } from '../pages/errors/ErrorPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { useAuth } from './AuthContext';

interface RequireAuthProps {
  // Omit to allow any signed-in user.
  roles?: readonly UserRole[];
  children?: ReactNode;
}

export interface LoginRedirectState {
  from?: string;
}

// Route guard. Usable as a wrapper or as a layout route (renders <Outlet/>).
// UI-only: the API enforces the same roles with [Authorize(Roles = ...)], so
// this guard exists for UX, not for security.
export function RequireAuth({ roles, children }: RequireAuthProps) {
  const { status, user, error, retry, sessionEnded } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite" className="mx-auto max-w-7xl space-y-4 px-6 py-16">
        <span className="sr-only">{t('auth.checking')}</span>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  // /me failed for a reason other than 401: the API is down, unreachable,
  // in maintenance or broke. The designed page says which, with a retry.
  if (status === 'error') {
    const { kind, traceId } = classifyError(error);
    return (
      <main id="main">
        <ErrorPage kind={kind} traceId={traceId} onRetry={retry} standalone />
      </main>
    );
  }

  // The session ran out (or was ended by the API) while the user was here.
  if ((status === 'anonymous' || !user) && sessionEnded) {
    return (
      <main id="main">
        <ErrorPage kind="sessionExpired" standalone />
      </main>
    );
  }

  if (status === 'anonymous' || !user) {
    const state: LoginRedirectState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <ForbiddenPage role={user.role} />;
  }

  return children ?? <Outlet />;
}
