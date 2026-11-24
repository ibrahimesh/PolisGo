import { ERROR_SORTS, ERROR_SOURCES, ERROR_STATUSES } from '../../../api/types';
import type { ErrorListQuery, ErrorSort, ErrorSource, ErrorStatus } from '../../../api/types';

// The error list's filters live in the URL, like the audit log's: anything
// that doesn't parse is dropped rather than sent as a 400.

export const ERRORS_PAGE_SIZE = 25;
export const ERRORS_SEARCH_MAX = 100;

export interface ErrorsState {
  q: string;
  source: ErrorSource | '';
  status: ErrorStatus | '';
  regressed: boolean;
  sort: ErrorSort;
  page: number;
}

export const DEFAULT_ERRORS: ErrorsState = {
  q: '',
  source: '',
  status: '',
  regressed: false,
  sort: 'LastSeen',
  page: 1,
};

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | '' =>
  value !== null && (values as readonly string[]).includes(value) ? (value as T) : '';

export function readErrors(params: URLSearchParams): ErrorsState {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    q: (params.get('q') ?? '').slice(0, ERRORS_SEARCH_MAX),
    source: oneOf(ERROR_SOURCES, params.get('source')),
    status: oneOf(ERROR_STATUSES, params.get('status')),
    regressed: params.get('regressed') === 'true',
    sort: oneOf(ERROR_SORTS, params.get('sort')) || 'LastSeen',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 200) : 1,
  };
}

export function writeErrors(state: ErrorsState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set('q', state.q);
  if (state.source) params.set('source', state.source);
  if (state.status) params.set('status', state.status);
  if (state.regressed) params.set('regressed', 'true');
  if (state.sort !== 'LastSeen') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

export function toErrorQuery(state: ErrorsState): ErrorListQuery {
  const search = state.q.trim();
  return {
    ...(search ? { search } : {}),
    ...(state.source ? { source: state.source } : {}),
    ...(state.status ? { status: state.status } : {}),
    ...(state.regressed ? { regressed: true } : {}),
    sort: state.sort,
    page: state.page,
    pageSize: ERRORS_PAGE_SIZE,
  };
}

export function hasErrorFilters(state: ErrorsState): boolean {
  return Boolean(state.q.trim() || state.source || state.status || state.regressed);
}

// What the lookup and the palette accept as a Reference: 8 hex characters
// (a dash or spaces allowed), a 32-hex trace id or a full traceparent. The
// API parses it again; this only decides whether to offer the lookup.
export function asReference(text: string): string | null {
  const trimmed = text.trim();
  const w3c = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i.exec(trimmed);
  if (w3c?.[1]) return w3c[1].slice(0, 8).toUpperCase();
  const compact = trimmed.replace(/[\s\-_:]/g, '');
  if (/^[0-9a-f]{32}$/i.test(compact) || /^[0-9a-f]{8}$/i.test(compact)) {
    return compact.slice(0, 8).toUpperCase();
  }
  return null;
}

// Where a Reference is resolved to its error (LookupPage).
export const lookupPath = (code: string) => `/app/admin/system/lookup/${encodeURIComponent(code)}`;
