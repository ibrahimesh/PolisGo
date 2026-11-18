import { CLAIM_STATUSES } from '../../api/types';
import type { ClaimSortBy, ListClaimsQuery, SortDirection } from '../../api/types';
import { CLAIM_RULES } from './claimRules';

// Same contract as the policies list: filters live in the URL, unknown values
// fall back to the default instead of reaching the API as a 400.

export const PAGE_SIZE = 10;

// "open" groups the two statuses that still await a decision.
export const STATUS_FILTERS = ['open', ...CLAIM_STATUSES] as const;
export type ClaimStatusFilter = (typeof STATUS_FILTERS)[number] | '';

export const SORT_OPTIONS = [
  { id: 'newest', sortBy: 'CreatedAt', sortDir: 'Desc' },
  { id: 'oldest', sortBy: 'CreatedAt', sortDir: 'Asc' },
  { id: 'incidentLatest', sortBy: 'IncidentDate', sortDir: 'Desc' },
  { id: 'incidentEarliest', sortBy: 'IncidentDate', sortDir: 'Asc' },
  { id: 'amountHigh', sortBy: 'ClaimedAmount', sortDir: 'Desc' },
  { id: 'amountLow', sortBy: 'ClaimedAmount', sortDir: 'Asc' },
  { id: 'number', sortBy: 'ClaimNumber', sortDir: 'Asc' },
] as const satisfies readonly { id: string; sortBy: ClaimSortBy; sortDir: SortDirection }[];

export type ClaimSortId = (typeof SORT_OPTIONS)[number]['id'];

export interface ClaimListState {
  status: ClaimStatusFilter;
  search: string;
  sort: ClaimSortId;
  page: number;
}

export const DEFAULT_CLAIM_LIST: ClaimListState = {
  status: '',
  search: '',
  sort: 'newest',
  page: 1,
};

export function readClaimList(params: URLSearchParams): ClaimListState {
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as ClaimStatusFilter)
      : '',
    search: (params.get('q') ?? '').slice(0, CLAIM_RULES.maxSearch),
    sort: SORT_OPTIONS.some((o) => o.id === sort) ? (sort as ClaimSortId) : 'newest',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function writeClaimList(state: ClaimListState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.status) params.set('status', state.status);
  if (state.search.trim()) params.set('q', state.search.trim());
  if (state.sort !== DEFAULT_CLAIM_LIST.sort) params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

export function toClaimQuery(state: ClaimListState): ListClaimsQuery {
  const sort = SORT_OPTIONS.find((o) => o.id === state.sort) ?? SORT_OPTIONS[0];
  return {
    ...(state.status === 'open' ? { open: true } : state.status ? { status: state.status } : {}),
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    page: state.page,
    pageSize: PAGE_SIZE,
  };
}

export function hasClaimFilters(state: ClaimListState): boolean {
  return Boolean(state.status || state.search.trim());
}
