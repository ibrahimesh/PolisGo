import { CLAIM_STATUSES } from '../../../api/types';
import type { ClaimSortBy, ClaimStatus, ListClaimsQuery, SortDirection } from '../../../api/types';
import { CLAIM_RULES } from '../../claims/claimRules';

// The adjuster's queue: everything in the URL (view, filters, sort, page), so
// a reload, Back and a shared link land on the same list. Unknown values fall
// back to the defaults instead of reaching the API as a 400.

export const QUEUE_PAGE_SIZE = 20;

// "Needs my attention" presets. The API scopes rows anyway (an adjuster sees
// the open queue and their own claims), so each view is a plain filter.
export const QUEUE_VIEWS = ['waiting', 'mine', 'toPay', 'all'] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

export const QUEUE_SORTS = [
  { id: 'oldest', sortBy: 'CreatedAt', sortDir: 'Asc' },
  { id: 'newest', sortBy: 'CreatedAt', sortDir: 'Desc' },
  { id: 'amountHigh', sortBy: 'ClaimedAmount', sortDir: 'Desc' },
  { id: 'amountLow', sortBy: 'ClaimedAmount', sortDir: 'Asc' },
  { id: 'incidentLatest', sortBy: 'IncidentDate', sortDir: 'Desc' },
  { id: 'number', sortBy: 'ClaimNumber', sortDir: 'Asc' },
] as const satisfies readonly { id: string; sortBy: ClaimSortBy; sortDir: SortDirection }[];
export type QueueSortId = (typeof QUEUE_SORTS)[number]['id'];

export interface QueueState {
  view: QueueView;
  // Only used by the "all" view; the presets fix their own status.
  status: ClaimStatus | '';
  search: string;
  sort: QueueSortId;
  page: number;
}

// Oldest first: the claim that has waited longest is the one to pick up.
export const DEFAULT_QUEUE: QueueState = {
  view: 'waiting',
  status: '',
  search: '',
  sort: 'oldest',
  page: 1,
};

export function readQueue(params: URLSearchParams): QueueState {
  const view = params.get('view') ?? '';
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const parsedView = (QUEUE_VIEWS as readonly string[]).includes(view)
    ? (view as QueueView)
    : DEFAULT_QUEUE.view;
  return {
    view: parsedView,
    status:
      parsedView === 'all' && (CLAIM_STATUSES as readonly string[]).includes(status)
        ? (status as ClaimStatus)
        : '',
    search: (params.get('q') ?? '').slice(0, CLAIM_RULES.maxSearch),
    sort: QUEUE_SORTS.some((o) => o.id === sort) ? (sort as QueueSortId) : DEFAULT_QUEUE.sort,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

// Only non-default values go in the URL.
export function writeQueue(state: QueueState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view !== DEFAULT_QUEUE.view) params.set('view', state.view);
  if (state.view === 'all' && state.status) params.set('status', state.status);
  if (state.search.trim()) params.set('q', state.search.trim());
  if (state.sort !== DEFAULT_QUEUE.sort) params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

function viewFilter(state: QueueState): ListClaimsQuery {
  switch (state.view) {
    case 'waiting':
      return { status: 'Submitted' };
    case 'mine':
      return { status: 'UnderReview', assignedToMe: true };
    case 'toPay':
      return { status: 'Approved' };
    case 'all':
      return state.status ? { status: state.status } : {};
  }
}

// The filters without paging: the CSV export holds every matching row.
export function toQueueFilter(state: QueueState): ListClaimsQuery {
  const sort = QUEUE_SORTS.find((o) => o.id === state.sort) ?? QUEUE_SORTS[0];
  return {
    ...viewFilter(state),
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
  };
}

export function toQueueQuery(state: QueueState): ListClaimsQuery {
  return { ...toQueueFilter(state), page: state.page, pageSize: QUEUE_PAGE_SIZE };
}

export function hasQueueFilters(state: QueueState): boolean {
  return Boolean(state.search.trim() || (state.view === 'all' && state.status));
}

// Age drives priority: an open claim waiting this long is flagged.
export const ATTENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function ageInDays(since: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY_MS));
}

export function needsAttention(
  claim: { status: ClaimStatus; createdAt: string },
  now: Date = new Date(),
): boolean {
  return (
    (claim.status === 'Submitted' || claim.status === 'UnderReview') &&
    ageInDays(claim.createdAt, now) >= ATTENTION_DAYS
  );
}
