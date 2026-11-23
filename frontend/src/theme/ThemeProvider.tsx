import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { withThemeTransition } from '../motion/viewTransitions';

export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'dark' | 'light';

// Keep in sync with the pre-paint script in index.html.
const STORAGE_KEY = 'polisgo.theme';
const DEFAULT_PREFERENCE: ThemePreference = 'dark';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if ((THEME_PREFERENCES as readonly (string | null)[]).includes(stored)) {
      return stored as ThemePreference;
    }
  } catch {
    // Storage blocked: use the default.
  }
  return DEFAULT_PREFERENCE;
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  // Follow OS changes live; only matters while the preference is "system".
  useEffect(() => {
    const media = window.matchMedia(LIGHT_QUERY);
    const onChange = () => setSystem(media.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? system : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    // Crossfade old and new snapshots (View Transitions; instant without).
    withThemeTransition(() => {
      const resolvedNext = next === 'system' ? systemTheme() : next;
      document.documentElement.dataset.theme = resolvedNext;
      setPreferenceState(next);
    });
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice just won't survive a reload.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return context;
}
