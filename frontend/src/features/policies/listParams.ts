import type { ListPoliciesQuery, PolicySortBy, PolicyStatus, SortDirection } from '../../api/types';

// The list's filters live in the URL, so a filtered view survives a reload,
// the Back button and a shared link. Anything unrecognised falls back to the
// default instead of reaching the API as a 400.

export const PAGE_SIZE = 10;
export const SEARCH_MAX = 100;

export const STATUS_FILTERS = ['Active', 'Draft', 'Expired', 'Cancelled'] as const;

// One select for field + direction reads better than two controls.
export const SORT_OPTIONS = [
  { id: 'newest', sortBy: 'CreatedAt', sortDir: 'Desc' },
  { id: 'oldest', sortBy: 'CreatedAt', sortDir: 'Asc' },
  { id: 'endSoonest', sortBy: 'EndDate', sortDir: 'Asc' },
  { id: 'endLatest', sortBy: 'EndDate', sortDir: 'Desc' },
  { id: 'premiumHigh', sortBy: 'Premium', sortDir: 'Desc' },
  { id: 'premiumLow', sortBy: 'Premium', sortDir: 'Asc' },
  { id: 'number', sortBy: 'PolicyNumber', sortDir: 'Asc' },
] as const satisfies readonly { id: string; sortBy: PolicySortBy; sortDir: SortDirection }[];

export type SortOptionId = (typeof SORT_OPTIONS)[number]['id'];

export interface ListState {
  status: PolicyStatus | '';
  type: string;
  search: string;
  sort: SortOptionId;
  page: number;
  // Admins: one agent's sales (an id), '' for all.
  agent: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_STATE: ListState = {
  status: '',
  type: '',
  search: '',
  sort: 'newest',
  page: 1,
  agent: '',
};

export function readListState(params: URLSearchParams): ListState {
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status) ? (status as PolicyStatus) : '',
    type: /^[A-Za-z]{1,16}$/.test(params.get('type') ?? '') ? (params.get('type') ?? '') : '',
    search: (params.get('q') ?? '').slice(0, SEARCH_MAX),
    sort: SORT_OPTIONS.some((o) => o.id === sort) ? (sort as SortOptionId) : 'newest',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    agent: GUID.test(params.get('agent') ?? '') ? (params.get('agent') ?? '') : '',
  };
}

// Only non-default values go in the URL, keeping it short and readable.
export function writeListState(state: ListState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.status) params.set('status', state.status);
  if (state.type) params.set('type', state.type);
  if (state.search.trim()) params.set('q', state.search.trim());
  if (state.sort !== DEFAULT_STATE.sort) params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.agent) params.set('agent', state.agent);
  return params;
}

export function toQuery(state: ListState): ListPoliciesQuery {
  const sort = SORT_OPTIONS.find((o) => o.id === state.sort) ?? SORT_OPTIONS[0];
  return {
    ...(state.status ? { status: state.status } : {}),
    ...(state.type ? { type: state.type } : {}),
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
    ...(state.agent ? { agentId: state.agent } : {}),
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    page: state.page,
    pageSize: PAGE_SIZE,
  };
}

export function hasFilters(state: ListState): boolean {
  return Boolean(state.status || state.type || state.search.trim() || state.agent);
}

export function pageCount(totalCount: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
