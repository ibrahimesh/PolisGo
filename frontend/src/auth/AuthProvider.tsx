import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/endpoints';
import { onUnauthorized } from '../api/http';
import { tokenStore } from '../api/tokenStore';
import type { AuthResponse, LoginRequest, RegisterRequest } from '../api/types';
import { useToast } from '../components/ui/ToastProvider';
import { AuthContext } from './AuthContext';
import type { AuthContextValue, AuthStatus } from './AuthContext';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [session, setSession] = useState(() => tokenStore.get());

  useEffect(() => tokenStore.subscribe(setSession), []);

  // When the API rejects our token, drop every cached private query and tell
  // the user; route guards then redirect to sign-in on the next render.
  useEffect(
    () =>
      onUnauthorized(() => {
        queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
        toast({ title: t('auth.sessionExpired'), tone: 'info' });
      }),
    [queryClient, toast, t],
  );

  // The token alone isn't trusted for identity: /me confirms it is still valid
  // and returns the user id that AuthResponse doesn't carry.
  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }) => authApi.me(signal),
    enabled: session !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const status: AuthStatus =
    session === null
      ? 'anonymous'
      : me.isSuccess
        ? 'authenticated'
        : me.isError
          ? 'error'
          : 'loading';

  const startSession = useCallback(
    async (response: AuthResponse) => {
      tokenStore.set({ token: response.token, expiresAt: response.expiresAt });
      try {
        return await queryClient.query({
          queryKey: ME_QUERY_KEY,
          queryFn: ({ signal }) => authApi.me(signal),
        });
      } catch (error) {
        // Never leave a half-session behind: a stored token whose /me failed
        // would later "log in" whoever opens the sign-in page in this tab.
        tokenStore.clear();
        queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
        throw error;
      }
    },
    [queryClient],
  );

  const login = useCallback(
    async (credentials: LoginRequest) => startSession(await authApi.login(credentials)),
    [startSession],
  );

  const register = useCallback(
    async (request: RegisterRequest) => startSession(await authApi.register(request)),
    [startSession],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    // Private data must not survive into the next user's session on this tab.
    queryClient.clear();
  }, [queryClient]);

  const retry = useCallback(() => void me.refetch(), [me]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: status === 'authenticated' ? (me.data ?? null) : null,
      error: me.error,
      login,
      register,
      logout,
      retry,
    }),
    [status, me.data, me.error, login, register, logout, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
