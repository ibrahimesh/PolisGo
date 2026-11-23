import { isApiError } from '../../api/errors';

export const ERROR_KINDS = [
  'notFound',
  'forbidden',
  'server',
  'sessionExpired',
  'offline',
  'unreachable',
  'maintenance',
] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export interface ClassifiedError {
  kind: ErrorKind;
  traceId: string | undefined;
}

// A lazy route whose chunk can't be fetched fails with a TypeError whose
// wording differs per browser; all of them mean "the network let us down".
const CHUNK_FAILURE =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch/i;

export function classifyError(error: unknown, online = navigator.onLine): ClassifiedError {
  if (isApiError(error)) {
    const traceId = error.traceId;
    if (error.kind === 'network') return { kind: online ? 'unreachable' : 'offline', traceId };
    if (error.status === 503) return { kind: 'maintenance', traceId };
    if (error.status === 401) return { kind: 'sessionExpired', traceId };
    if (error.status === 403) return { kind: 'forbidden', traceId };
    if (error.status === 404) return { kind: 'notFound', traceId };
    return { kind: 'server', traceId };
  }
  if (error instanceof Error && CHUNK_FAILURE.test(error.message)) {
    return { kind: online ? 'unreachable' : 'offline', traceId: undefined };
  }
  return { kind: 'server', traceId: undefined };
}
