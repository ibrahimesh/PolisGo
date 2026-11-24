import { API_BASE_URL } from '../api/baseUrl';
import { tokenStore } from '../api/tokenStore';

// Sends what breaks in the browser to the API's error tracking (the System
// section): uncaught errors, unhandled promise rejections, render crashes
// and failed API calls the server never saw. Small and defensive:
// - throttled (10 a minute) and deduplicated (the same error on the same
//   page once a minute), so a loop can't flood the endpoint;
// - offline: a few reports wait for the connection, the rest are dropped;
// - never reports its own failures, never awaits, never throws;
// - sends no form values, no tokens (only the Authorization header, from
//   which the API reads the role), no full URLs: the page is a route
//   template, scripts lose their origin and query string;
// - off in unit tests, and in the e2e suite unless a test turns it on.

export type ReportKind = 'error' | 'unhandledrejection' | 'boundary' | 'network' | 'http';

const ENDPOINT = '/api/diagnostics/client-errors';
const MAX_PER_MINUTE = 10;
const DEDUPE_MS = 60_000;
const OFFLINE_QUEUE = 5;
const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;
export const E2E_REPORTER_FLAG = 'polisgo.e2e.reporter';
// The SPA build (package.json version), kept to the API's allowed characters.
const APP_VERSION = (import.meta.env.VITE_APP_VERSION ?? 'dev').replace(/[^\w.+-]/g, '');

interface Payload {
  kind: ReportKind;
  message: string;
  name?: string;
  stack?: string;
  route: string;
  appVersion: string;
  traceId: string;
  httpStatus?: number;
}

const state = {
  sent: [] as number[],
  recent: new Map<string, { at: number; traceId: string }>(),
  queue: [] as Payload[],
  listening: false,
  forced: null as boolean | null,
};

function enabled(): boolean {
  if (state.forced !== null) return state.forced;
  if (import.meta.env.MODE === 'test') return false;
  if (import.meta.env.VITE_E2E_ROUTES === 'true') {
    try {
      return localStorage.getItem(E2E_REPORTER_FLAG) === 'on';
    } catch {
      return false;
    }
  }
  return true;
}

// Unit tests switch it on (or off) explicitly; null restores the default.
export function setReporterEnabledForTests(on: boolean | null) {
  state.forced = on;
  state.sent = [];
  state.recent.clear();
  state.queue = [];
}

// A W3C traceparent, as the API's: a crash in the browser has no server
// trace id, so the reporter makes one; the error page shows its Reference
// and the API stores the same id.
export function newTraceId(): string {
  const hex = (bytes: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  return `00-${hex(16)}-${hex(8)}-01`;
}

// "/app/claims/3f2a…" → "/app/claims/:id": a segment with a digit is a
// value, and anything outside the API's allowed characters becomes ":param".
export function routeTemplate(pathname: string): string {
  const template = pathname
    .split('/')
    .map((segment, index) => {
      if (index === 0 || segment === '') return segment;
      // Digits only, or 8+ characters with a digit (ids, References,
      // policy numbers); "__e2e" or "v2" stay as they are.
      if (/^\d+$/.test(segment) || (segment.length >= 8 && /\d/.test(segment))) return ':id';
      return /^[\w.-]+$/.test(segment) ? segment : ':param';
    })
    .join('/');
  return (template.startsWith('/') ? template : `/${template}`).slice(0, 200);
}

// The page's own text can carry what the user typed (an email in a
// validation message, a token in a URL): cut the obvious shapes before
// anything leaves the browser. The API redacts again, more thoroughly.
export function scrub(text: string): string {
  return text
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/)]+/gi, '')
    .replace(/\?[^\s)'"]*/g, '')
    .replace(/eyJ[\w-]{4,}\.[\w-]{4,}(?:\.[\w-]+)?/g, '[jwt]')
    .replace(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?<![\w-])\+?\d(?:[ -]?\d){8,}(?![\w-])/g, '[number]');
}

function messageTemplate(message: string) {
  return message.replace(/\d+/g, '#').replace(/["'«“][^"'»”]*["'»”]/g, '…');
}

function describe(error: unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name,
      ...(/^[A-Za-z][\w.$]*$/.test(error.name) ? { name: error.name.slice(0, 100) } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  if (typeof error === 'string') return { message: error };
  return { message: 'Non-error value thrown' };
}

// Reports an error; returns the trace id that stands for it, which is the
// earlier one when the same error was reported a moment ago (so a Reference
// shown twice is the one that was stored).
export function reportError(
  error: unknown,
  kind: ReportKind,
  extra: { traceId?: string; httpStatus?: number; message?: string } = {},
): string {
  const traceId = extra.traceId ?? newTraceId();
  try {
    if (!enabled()) return traceId;
    const described = describe(error);
    const message =
      scrub(extra.message ?? described.message)
        .trim()
        .slice(0, MAX_MESSAGE) || kind;
    const route = routeTemplate(window.location.pathname);
    const now = Date.now();

    const key = `${kind}|${described.name ?? ''}|${messageTemplate(message)}|${route}`;
    const seen = state.recent.get(key);
    if (seen && now - seen.at < DEDUPE_MS) return seen.traceId;
    state.recent.set(key, { at: now, traceId });
    for (const [k, v] of state.recent) if (now - v.at >= DEDUPE_MS) state.recent.delete(k);

    const payload: Payload = {
      kind,
      message,
      route,
      appVersion: APP_VERSION,
      traceId,
      ...(described.name ? { name: described.name } : {}),
      ...(described.stack ? { stack: scrub(described.stack).slice(0, MAX_STACK) } : {}),
      ...(extra.httpStatus ? { httpStatus: extra.httpStatus } : {}),
    };
    if (!navigator.onLine) {
      if (state.queue.length < OFFLINE_QUEUE) state.queue.push(payload);
      listenForOnline();
      return traceId;
    }
    send(payload, now);
  } catch {
    // Reporting must never be the next error.
  }
  return traceId;
}

// A call the API never answered (network) or answered with a 5xx it didn't
// record (no trace id). The path is reduced to its template.
export function reportApiFailure({
  method,
  path,
  status,
}: {
  method: string;
  path: string;
  status: number | null;
}) {
  if (path.startsWith(ENDPOINT)) return;
  const template = routeTemplate(path.split('?')[0] ?? path);
  reportError(null, status === null ? 'network' : 'http', {
    message:
      status === null
        ? `${method} ${template} failed: network error`
        : `${method} ${template} answered ${status}`,
    ...(status === null ? {} : { httpStatus: status }),
  });
}

function send(payload: Payload, now: number) {
  state.sent = state.sent.filter((at) => now - at < 60_000);
  if (state.sent.length >= MAX_PER_MINUTE) return;
  state.sent.push(now);
  const session = tokenStore.get();
  void fetch(`${API_BASE_URL}${ENDPOINT}`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Lost: not retried, not reported (that would be a loop).
  });
}

function listenForOnline() {
  if (state.listening) return;
  state.listening = true;
  window.addEventListener(
    'online',
    () => {
      state.listening = false;
      const waiting = state.queue.splice(0);
      for (const payload of waiting) send(payload, Date.now());
    },
    { once: true },
  );
}

// Uncaught errors and unhandled rejections, for the whole app.
export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => {
    // "Script error." from a cross-origin script (an extension) says nothing.
    if (!event.error && /^Script error\.?$/.test(event.message)) return;
    // Browser noise, not a bug in the app.
    if (/ResizeObserver loop/.test(event.message)) return;
    reportError(event.error ?? event.message, 'error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    // Aborted fetches (navigation, React Query cancelling) are not errors.
    const reason: unknown = event.reason;
    if (reason instanceof DOMException && reason.name === 'AbortError') return;
    reportError(reason, 'unhandledrejection');
  });
}
