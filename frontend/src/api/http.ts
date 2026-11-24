import { reportApiFailure } from '../diagnostics/reporter';
import { API_BASE_URL } from './baseUrl';
import { ApiError, parseProblem } from './errors';
import { tokenStore } from './tokenStore';

export { API_BASE_URL };

// Arrays repeat the key (actions=a&actions=b), as ASP.NET binds string[].
type QueryValue = string | number | boolean | null | undefined | readonly string[];

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  // Anonymous endpoints skip the header so a stale token can't turn a public
  // call (e.g. the quote calculator) into a 401.
  anonymous?: boolean;
  responseType?: 'json' | 'text' | 'blob';
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

// Fired when the API rejects a token we sent — expired or revoked — so the
// auth layer can tell the user and route them to sign-in.
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(API_BASE_URL + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value as readonly string[]) url.searchParams.append(key, item);
    } else if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, anonymous = false, responseType = 'json' } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const session = anonymous ? null : tokenStore.get();
  if (session) headers.Authorization = `Bearer ${session.token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? null,
    });
  } catch (error) {
    // Let React Query see aborts as aborts, not as "API unreachable".
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    reportApiFailure({ method, path, status: null });
    throw new ApiError('network', 0, undefined, error);
  }

  if (!response.ok) {
    const problem = await parseProblem(response);
    // A 5xx with a trace id is already recorded by the API; one without
    // (a proxy's 502, a dead gateway) is only seen here.
    if (response.status >= 500 && !problem?.traceId) {
      reportApiFailure({ method, path, status: response.status });
    }
    if (response.status === 401 && session) {
      tokenStore.clear();
      for (const listener of unauthorizedListeners) listener();
    }
    throw new ApiError('http', response.status, problem);
  }

  if (response.status === 204) return undefined as T;
  if (responseType === 'text') return (await response.text()) as T;
  if (responseType === 'blob') return (await response.blob()) as T;
  return (await response.json()) as T;
}
