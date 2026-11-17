import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import type { CurrentUserResponse, UserRole } from '../api/types';
import { renderWithProviders } from '../test/utils';
import { AuthContext } from './AuthContext';
import type { AuthContextValue, AuthStatus } from './AuthContext';
import type { LoginRedirectState } from './RequireAuth';
import { RequireAuth } from './RequireAuth';

function authValue(status: AuthStatus, role?: UserRole): AuthContextValue {
  const user: CurrentUserResponse | null = role
    ? { id: '7d1c1f5e-0000-4000-8000-000000000001', email: 'a@b.az', fullName: 'Aysel', role }
    : null;
  return {
    status,
    user,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
  };
}

function LoginProbe() {
  const state = useLocation().state as LoginRedirectState | null;
  return <p>login page, from {state?.from}</p>;
}

function renderGuard(value: AuthContextValue, roles?: readonly UserRole[]) {
  return renderWithProviders(
    <AuthContext.Provider value={value}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route
          path="/app/admin"
          element={
            <RequireAuth {...(roles ? { roles } : {})}>
              <p>protected content</p>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthContext.Provider>,
    { route: '/app/admin?tab=users' },
  );
}

describe('RequireAuth', () => {
  it('redirects anonymous users to sign-in and remembers where they were going', () => {
    renderGuard(authValue('anonymous'));
    expect(screen.getByText('login page, from /app/admin?tab=users')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('shows a busy placeholder while the session is being checked', () => {
    renderGuard(authValue('loading'));
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(screen.queryByText(/login page/)).not.toBeInTheDocument();
  });

  it('renders children for any signed-in role when no roles are required', () => {
    renderGuard(authValue('authenticated', 'Client'));
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it.each<UserRole>(['Client', 'Agent', 'Adjuster'])(
    'blocks %s from an Admin-only area',
    (role) => {
      renderGuard(authValue('authenticated', role), ['Admin']);
      expect(screen.queryByText('protected content')).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: "This area isn't available for your role" }),
      ).toBeInTheDocument();
    },
  );

  it('lets an allowed role through', () => {
    renderGuard(authValue('authenticated', 'Adjuster'), ['Adjuster', 'Admin']);
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });
});
