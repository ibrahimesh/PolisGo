import type { CustomerSortBy, ListCustomersQuery, SortDirection } from '../../../api/types';

// The directory's search, sort and page live in the URL, like every list.
// Search matches name, email or phone digits; the API enforces 100 characters.

export const CUSTOMER_PAGE_SIZE = 20;
export const CUSTOMER_SEARCH_MAX = 100;

export const CUSTOMER_SORTS = [
  { id: 'newest', sortBy: 'CreatedAt', sortDir: 'Desc' },
  { id: 'nameAsc', sortBy: 'FullName', sortDir: 'Asc' },
  { id: 'nameDesc', sortBy: 'FullName', sortDir: 'Desc' },
  { id: 'email', sortBy: 'Email', sortDir: 'Asc' },
  { id: 'oldest', sortBy: 'CreatedAt', sortDir: 'Asc' },
] as const satisfies readonly { id: string; sortBy: CustomerSortBy; sortDir: SortDirection }[];
export type CustomerSortId = (typeof CUSTOMER_SORTS)[number]['id'];

export interface CustomerListState {
  search: string;
  sort: CustomerSortId;
  page: number;
  // Admins: an agent's id, 'none' for unassigned customers, '' for everyone.
  agent: string;
}

export const DEFAULT_CUSTOMER_LIST: CustomerListState = {
  search: '',
  sort: 'newest',
  page: 1,
  agent: '',
};
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readCustomerList(params: URLSearchParams): CustomerListState {
  const sort = params.get('sort') ?? '';
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    search: (params.get('q') ?? '').slice(0, CUSTOMER_SEARCH_MAX),
    sort: CUSTOMER_SORTS.some((o) => o.id === sort) ? (sort as CustomerSortId) : 'newest',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    agent: ((agent) => (agent === 'none' || GUID.test(agent) ? agent : ''))(
      params.get('agent') ?? '',
    ),
  };
}

export function writeCustomerList(state: CustomerListState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set('q', state.search.trim());
  if (state.sort !== DEFAULT_CUSTOMER_LIST.sort) params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.agent) params.set('agent', state.agent);
  return params;
}

export function toCustomerQuery(state: CustomerListState): ListCustomersQuery {
  const sort = CUSTOMER_SORTS.find((o) => o.id === state.sort) ?? CUSTOMER_SORTS[0];
  return {
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
    ...(state.agent === 'none'
      ? { unassigned: true }
      : state.agent
        ? { agentId: state.agent }
        : {}),
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    page: state.page,
    pageSize: CUSTOMER_PAGE_SIZE,
  };
}
