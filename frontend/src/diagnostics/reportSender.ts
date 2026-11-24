import { API_BASE_URL } from '../api/baseUrl';
import { tokenStore } from '../api/tokenStore';
import type { ReportKind } from './reporter';
import { newTraceId } from './reporter';

// The part of the error reporter that builds and sends reports. Loaded on
// the first error (reporter.ts imports it dynamically), so no page pays for
// it up front. Small and defensive:
// - throttled (10 a minute) and deduplicated (the same error on the same
//   page once a minute), so a loop can't flood the endpoint;
// - offline: a few reports wait for the connection, the rest are dropped;
// - never reports its own failures, never awaits, never throws;
// - sends no form values, no tokens (only the Authorization header, from
//   which the API reads the role), no full URLs: the page is a route
//   template, scripts lose their origin and query string.

const ENDPOINT = '/api/diagnostics/client-errors';
const MAX_PER_MINUTE = 10;
const DEDUPE_MS = 60_000;
const OFFLINE_QUEUE = 5;
const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;
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
};

export function resetForTests() {
  state.sent = [];
  state.recent.clear();
  state.queue = [];
}

// "/app/claims/3f2a…" → "/app/claims/:id": a segment of digits, or of 8+
// characters with a digit (ids, References, policy numbers), is a value;
// anything outside the API's allowed characters becomes ":param".
export function routeTemplate(pathname: string): string {
  const template = pathname
    .split('/')
    .map((segment, index) => {
      if (index === 0 || segment === '') return segment;
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

// Sends one report; returns the trace id that stands for it, which is the
// earlier one when the same error was reported a moment ago (so a Reference
// shown twice is the one that was stored).
export function sendReport(
  error: unknown,
  kind: ReportKind,
  extra: { traceId?: string; httpStatus?: number; message?: string } = {},
): string {
  const traceId = extra.traceId ?? newTraceId();
  try {
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
export function sendApiFailure({
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
  sendReport(null, status === null ? 'network' : 'http', {
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
