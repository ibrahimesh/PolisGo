import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { CustomerListItem } from '../../../api/types';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { SearchIcon } from '../../../components/ui/icons';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Caption, Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { useFormatters } from '../../../i18n/format';
import { useDebouncedValue } from '../../../lib/hooks';
import { useAuth } from '../../../auth/AuthContext';
import { StaffPicker } from '../../admin/StaffPicker';
import { ListSkeleton } from '../ListSkeleton';
import { useCustomers } from '../queries';
import {
  CUSTOMER_PAGE_SIZE,
  CUSTOMER_SEARCH_MAX,
  CUSTOMER_SORTS,
  DEFAULT_CUSTOMER_LIST,
  readCustomerList,
  toCustomerQuery,
  writeCustomerList,
} from './customerParams';
import type { CustomerListState } from './customerParams';

// The agent's own book (an Admin sees everyone): the API returns only the
// customers assigned to the caller, so this page never filters by owner.
export function CustomersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readCustomerList(params);
  const resultsId = useId();

  const [searchText, setSearchText] = useState(state.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  const update = (patch: Partial<CustomerListState>) =>
    setParams(writeCustomerList({ ...state, page: 1, ...patch }), { replace: true });

  useEffect(() => {
    if (debouncedSearch.trim() !== state.search.trim()) update({ search: debouncedSearch });
    // Only the debounced text should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const customers = useCustomers(toCustomerQuery(state));
  const data = customers.data;
  const pages = data ? Math.max(1, Math.ceil(data.totalCount / CUSTOMER_PAGE_SIZE)) : 1;
  const filtered = Boolean(state.search.trim() || state.agent);
  const { user } = useAuth();
  // Admins see every book, so they filter by agent and see who has whom.
  const isAdmin = user?.role === 'Admin';

  return (
    <div className="space-y-8">
      <PageHeader title={t('staff.customers.title')} description={t('staff.customers.lead')} />

      <form
        role="search"
        aria-label={t('staff.customers.filters')}
        aria-controls={resultsId}
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: searchText });
        }}
        className={
          isAdmin
            ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]'
            : 'grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
        }
      >
        <Input
          label={t('staff.customers.search')}
          type="search"
          value={searchText}
          maxLength={CUSTOMER_SEARCH_MAX}
          hint={t('staff.customers.searchHint')}
          onChange={(event) => setSearchText(event.target.value)}
          trailing={
            <span className="grid size-10 place-items-center text-muted" aria-hidden="true">
              <SearchIcon />
            </span>
          }
        />
        <Select
          label={t('claims.sort')}
          value={state.sort}
          onChange={(event) => update({ sort: event.target.value as CustomerListState['sort'] })}
          options={CUSTOMER_SORTS.map((option) => ({
            value: option.id,
            label: t(`staff.customers.sort.${option.id}`),
          }))}
        />
        {isAdmin && <AgentFilter value={state.agent} onChange={(agent) => update({ agent })} />}
      </form>

      <section id={resultsId} aria-labelledby={`${resultsId}-title`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${resultsId}-title`} className="sr-only">
            {t('staff.customers.results')}
          </h2>
          <p aria-live="polite" className="text-sm text-muted">
            {data ? t('staff.customers.count', { count: data.totalCount }) : ' '}
          </p>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchText('');
                setParams(writeCustomerList(DEFAULT_CUSTOMER_LIST), { replace: true });
              }}
            >
              {t('policies.clearFilters')}
            </Button>
          )}
        </div>

        {customers.isPending ? (
          <ListSkeleton />
        ) : customers.isError ? (
          <ErrorNotice
            error={customers.error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void customers.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : customers.data.totalCount === 0 ? (
          <EmptyState
            headingLevel="h3"
            title={filtered ? t('staff.customers.noMatchTitle') : t('staff.customers.emptyTitle')}
            body={filtered ? t('staff.customers.noMatchBody') : t('staff.customers.emptyBody')}
          />
        ) : (
          <div
            aria-busy={customers.isFetching}
            className={customers.isFetching ? 'opacity-60 transition-opacity' : undefined}
          >
            <CustomerCards items={customers.data.items} showAgent={isAdmin} />
            <CustomerTable items={customers.data.items} showAgent={isAdmin} />
          </div>
        )}

        {data && data.totalCount > 0 && pages > 1 && (
          <Pagination
            page={Math.min(state.page, pages)}
            pages={pages}
            label={t('staff.customers.pagination')}
            onChange={(page) => setParams(writeCustomerList({ ...state, page }))}
          />
        )}
      </section>
    </div>
  );
}

function AgentFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <StaffPicker
      label={t('admin.customers.agent')}
      staffRole="Agent"
      value={value}
      onChange={onChange}
      emptyOption={{ value: '', label: t('admin.customers.anyAgent') }}
      extraOptions={[{ value: 'none', label: t('admin.customers.unassigned') }]}
    />
  );
}

function CustomerTable({
  items,
  showAgent,
}: {
  items: readonly CustomerListItem[];
  showAgent: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  return (
    <div className="hidden md:block">
      <Table>
        <Caption>{t('staff.customers.caption')}</Caption>
        <THead>
          <Tr className="border-line">
            <Th>{t('staff.customers.columns.name')}</Th>
            <Th>{t('staff.customers.columns.contact')}</Th>
            <Th className="text-right">{t('staff.customers.columns.policies')}</Th>
            <Th className="text-right">{t('staff.customers.columns.claims')}</Th>
            {showAgent ? (
              <Th>{t('admin.customers.agent')}</Th>
            ) : (
              <Th>{t('staff.customers.columns.since')}</Th>
            )}
          </Tr>
        </THead>
        <TBody className="stagger">
          {items.map((customer) => (
            <Tr key={customer.id} className="border-line">
              <Td>
                <Link
                  to={`/app/customers/${customer.id}`}
                  className="font-medium break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
                >
                  {customer.fullName}
                </Link>
              </Td>
              <Td>
                <span className="block max-w-64 truncate" title={customer.email}>
                  {customer.email}
                </span>
                <span className="block text-sm text-muted tabular">{customer.phone}</span>
              </Td>
              <Td className="text-right whitespace-nowrap">
                {t('staff.customers.activeOfTotal', {
                  active: format.integer(customer.activePolicyCount),
                  total: format.integer(customer.policyCount),
                })}
              </Td>
              <Td className="text-right">{format.integer(customer.claimCount)}</Td>
              {showAgent ? (
                <Td className="text-sm">{customer.agentName ?? t('admin.customers.unassigned')}</Td>
              ) : (
                <Td className="text-sm whitespace-nowrap">
                  {format.date(customer.createdAt.slice(0, 10))}
                </Td>
              )}
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function CustomerCards({
  items,
  showAgent,
}: {
  items: readonly CustomerListItem[];
  showAgent: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  return (
    <ul className="stagger divide-y divide-line border-y border-line md:hidden">
      {items.map((customer) => (
        <li key={customer.id} className="space-y-1 py-4">
          <Link
            to={`/app/customers/${customer.id}`}
            className="font-medium break-words underline decoration-line-strong underline-offset-4"
          >
            {customer.fullName}
          </Link>
          <p className="text-sm break-all text-muted">{customer.email}</p>
          <p className="text-sm text-muted tabular">{customer.phone}</p>
          <p className="text-sm tabular">
            {t('staff.customers.cardSummary', {
              active: format.integer(customer.activePolicyCount),
              total: format.integer(customer.policyCount),
              claims: format.integer(customer.claimCount),
            })}
          </p>
          {showAgent && (
            <p className="text-sm text-muted">
              {t('admin.customers.agentLine', {
                name: customer.agentName ?? t('admin.customers.unassigned'),
              })}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
