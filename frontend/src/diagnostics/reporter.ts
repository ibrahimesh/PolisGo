// Sends what breaks in the browser to the API's error tracking (the System
// section): uncaught errors, unhandled promise rejections, render crashes
// and failed API calls the server never saw. This module is what every page
// loads: the listeners, the on/off rule and trace ids. Building and sending
// a report (throttling, dedupe, scrubbing, the offline queue) is in
// reportSender.ts, fetched on the first error, so pages that never fail
// don't pay for it. Off in unit tests, and in the e2e suite unless a test
// turns it on.

export type ReportKind = 'error' | 'unhandledrejection' | 'boundary' | 'network' | 'http';
export const E2E_REPORTER_FLAG = 'polisgo.e2e.reporter';

let forced: boolean | null = null;
const loadSender = () => import('./reportSender');

function enabled(): boolean {
  if (forced !== null) return forced;
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
export async function setReporterEnabledForTests(on: boolean | null) {
  forced = on;
  (await loadSender()).resetForTests();
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

// Reports an error. Resolves to the trace id that stands for it: the one
// given, or the earlier one when the same error was reported a moment ago
// (so a Reference shown twice is the stored one). Never rejects.
export async function reportError(
  error: unknown,
  kind: ReportKind,
  extra: { traceId?: string; httpStatus?: number; message?: string } = {},
): Promise<string> {
  const traceId = extra.traceId ?? newTraceId();
  if (!enabled()) return traceId;
  try {
    return (await loadSender()).sendReport(error, kind, { ...extra, traceId });
  } catch {
    // The chunk didn't load (offline, a deploy): nothing to do about it here.
    return traceId;
  }
}

// A call the API never answered, or answered with a 5xx it didn't record.
export function reportApiFailure(failure: { method: string; path: string; status: number | null }) {
  if (!enabled()) return;
  loadSender()
    .then((sender) => sender.sendApiFailure(failure))
    .catch(() => {
      // As above: reporting must never be the next error.
    });
}

// Uncaught errors and unhandled rejections, for the whole app.
export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => {
    // "Script error." from a cross-origin script (an extension) says nothing.
    if (!event.error && /^Script error\.?$/.test(event.message)) return;
    // Browser noise, not a bug in the app.
    if (/ResizeObserver loop/.test(event.message)) return;
    void reportError(event.error ?? event.message, 'error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    // Aborted fetches (navigation, React Query cancelling) are not errors.
    const reason: unknown = event.reason;
    if (reason instanceof DOMException && reason.name === 'AbortError') return;
    void reportError(reason, 'unhandledrejection');
  });
}
