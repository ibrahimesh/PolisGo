// Where the JWT lives, and why.
//
// The API issues a single 60-minute access token and has no refresh endpoint
// or httpOnly cookie yet. Options considered:
//   - localStorage: survives reloads but also survives browser restarts and is
//     shared by every tab, so a stolen token lives longest there. Rejected.
//   - memory only: safest against persistence, but a page reload (F5) logs the
//     user out, which is unacceptable UX for an internal back-office tool.
//   - memory + sessionStorage mirror (chosen): reads always come from memory;
//     sessionStorage only rehydrates after a reload. It is scoped to one tab
//     and cleared when the tab closes. Like any JS-readable storage it is
//     exposed to XSS, so the token's short expiry and React's escaping are the
//     mitigations until the API gains an httpOnly refresh cookie — at that
//     point this module keeps only the in-memory part.

export interface Session {
  token: string;
  expiresAt: string;
}

type Listener = (session: Session | null) => void;

const STORAGE_KEY = 'polisgo.session';

let current: Session | null = readPersisted();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<Listener>();

function readPersisted(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'string') return null;
    return isExpired(parsed.expiresAt)
      ? null
      : { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function isExpired(expiresAt: string): boolean {
  const ms = Date.parse(expiresAt);
  return Number.isNaN(ms) || ms <= Date.now();
}

function persist(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (privacy mode); memory still works for this page.
  }
}

function scheduleExpiry(session: Session | null) {
  clearTimeout(expiryTimer);
  if (!session) return;
  const msLeft = Date.parse(session.expiresAt) - Date.now();
  // Drop the token the moment it expires so the UI never sends a dead one.
  expiryTimer = setTimeout(() => tokenStore.clear(), Math.max(msLeft, 0));
}

function emit() {
  for (const listener of listeners) listener(current);
}

scheduleExpiry(current);

export const tokenStore = {
  get(): Session | null {
    if (current && isExpired(current.expiresAt)) {
      tokenStore.clear();
    }
    return current;
  },

  set(session: Session) {
    current = session;
    persist(session);
    scheduleExpiry(session);
    emit();
  },

  clear() {
    if (current === null) return;
    current = null;
    persist(null);
    scheduleExpiry(null);
    emit();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
