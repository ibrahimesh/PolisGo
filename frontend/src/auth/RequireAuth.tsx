import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { UserRole } from '../api/types';
import { Button } from '../components/ui/Button';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { Skeleton } from '../components/ui/Skeleton';
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
  const { status, user, error, retry } = useAuth();
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

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <ErrorNotice
          error={error}
          title={t('errors.title')}
          action={
            <Button variant="secondary" size="sm" onClick={retry}>
              {t('calculator.retry')}
            </Button>
          }
        />
      </div>
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
