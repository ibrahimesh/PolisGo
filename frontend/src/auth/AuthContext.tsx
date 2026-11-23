import { createContext, useContext } from 'react';
import type { CurrentUserResponse, LoginRequest, RegisterRequest } from '../api/types';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUserResponse | null;
  // Set when /me failed for a reason other than 401 (e.g. API down).
  error: unknown;
  // True after a session ended without "Sign out" (expired, or the API
  // rejected the token); guarded pages then say so instead of redirecting.
  sessionEnded?: boolean;
  login: (credentials: LoginRequest) => Promise<CurrentUserResponse>;
  register: (request: RegisterRequest) => Promise<CurrentUserResponse>;
  logout: () => void;
  retry: () => void;
}

// Exported on its own so tests (and the role guard's tests in particular) can
// supply a fixed auth state without a network round-trip.
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
