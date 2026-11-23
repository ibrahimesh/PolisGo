import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { policiesApi } from '../../../api/endpoints';
import { useAuth } from '../../../auth/AuthContext';
import type { ListPoliciesQuery, PolicyResponse, PolicyStatus } from '../../../api/types';
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
import { usePolicyTypes } from '../../landing/usePolicyTypes';
import {
  DEFAULT_STATE,
  hasFilters,
  pageCount,
  readListState,
  SEARCH_MAX,
  SORT_OPTIONS,
  STATUS_FILTERS,
  toQuery,
  writeListState,
} from '../../policies/listParams';
import type { ListState } from '../../policies/listParams';
import { PolicyStatusBadge } from '../../policies/PolicyStatusBadge';
import { useProductName } from '../../policies/useProductName';
import { ExportButton } from '../ExportButton';
import { ListSkeleton } from '../ListSkeleton';
import { useSales } from '../queries';
import { StaffPicker } from '../../admin/StaffPicker';
import { exportFileName } from '../saveBlob';
import { SalesSummaryTiles } from './SalesSummaryTiles';

// The agent's own sales (an Admin's: everyone's). An agent can read more than
// they sold (every policy of their book), so the list asks for their sales
// by agent id, matching the figures at the top.
// mode 'agent': the agent's own sales with their figures. mode 'admin':
// every policy, with who sold it and a filter by agent.
export function SalesPage({ mode = 'agent' }: { mode?: 'agent' | 'admin' }) {
  const admin = mode === 'admin';
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readListState(params);
  const resultsId = useId();
  const types = usePolicyTypes();
  const product = useProductName();

  const [searchText, setSearchText] = useState(state.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  const update = (patch: Partial<ListState>) =>
    setParams(writeListState({ ...state, page: 1, ...patch }), { replace: true });

  useEffect(() => {
    if (debouncedSearch.trim() !== state.search.trim()) update({ search: debouncedSearch });
    // Only the debounced text should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { user } = useAuth();
  const listQuery = toQuery(state);
  const query: ListPoliciesQuery = admin || !user ? listQuery : { ...listQuery, agentId: user.id };
  const sales = useSales(query);
  const data = sales.data;
  const pages = data ? pageCount(data.totalCount) : 1;
  const filtered = hasFilters(state);
  // The export takes the list's filters without paging: every matching row.
  const exportFilter: ListPoliciesQuery = { ...query, page: undefined, pageSize: undefined };

  return (
    <div className="space-y-10">
      <PageHeader
        title={admin ? t('admin.policies.title') : t('staff.sales.title')}
        description={admin ? t('admin.policies.lead') : t('staff.sales.lead')}
        actions={
          <ExportButton
            fileName={exportFileName('policies')}
            disabled={data?.totalCount === 0}
            fetchCsv={() => policiesApi.exportCsv(exportFilter)}
          />
        }
      />

      {!admin && <SalesSummaryTiles />}

      <div className="space-y-8">
        <form
          role="search"
          aria-label={t('staff.sales.filters')}
          aria-controls={resultsId}
          onSubmit={(event) => {
            event.preventDefault();
            update({ search: searchText });
          }}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
        >
          <Input
            label={t('staff.sales.search')}
            type="search"
            value={searchText}
            maxLength={SEARCH_MAX}
            placeholder={t('staff.sales.searchPlaceholder')}
            onChange={(event) => setSearchText(event.target.value)}
            trailing={
              <span className="grid size-10 place-items-center text-muted" aria-hidden="true">
                <SearchIcon />
              </span>
            }
          />
          <Select
            label={t('policies.status')}
            value={state.status}
            onChange={(event) => update({ status: event.target.value as PolicyStatus | '' })}
            options={[
              { value: '', label: t('policies.allStatuses') },
              ...STATUS_FILTERS.map((status) => ({
                value: status,
                label: t(`policyStatus.${status}`),
              })),
            ]}
          />
          <Select
            label={t('policies.type')}
            value={state.type}
            onChange={(event) => update({ type: event.target.value })}
            options={[
              { value: '', label: t('policies.allTypes') },
              ...(types.data ?? []).map((type) => ({
                value: type.code,
                label: product.name(type.code),
              })),
            ]}
          />
          <Select
            label={t('claims.sort')}
            value={state.sort}
            onChange={(event) => update({ sort: event.target.value as ListState['sort'] })}
            options={SORT_OPTIONS.map((option) => ({
              value: option.id,
              label: t(`policies.sortOptions.${option.id}`),
            }))}
          />
          {admin && <AgentSelect value={state.agent} onChange={(agent) => update({ agent })} />}
        </form>

        <section id={resultsId} aria-labelledby={`${resultsId}-title`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`${resultsId}-title`} className="text-2xl">
              {t('staff.sales.listTitle')}
            </h2>
            <p aria-live="polite" className="text-sm text-muted">
              {data ? t('staff.sales.count', { count: data.totalCount }) : ' '}
            </p>
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchText('');
                  setParams(writeListState(DEFAULT_STATE), { replace: true });
                }}
              >
                {t('policies.clearFilters')}
              </Button>
            )}
          </div>

          {sales.isPending ? (
            <ListSkeleton />
          ) : sales.isError ? (
            <ErrorNotice
              error={sales.error}
              action={
                <Button variant="secondary" size="sm" onClick={() => void sales.refetch()}>
                  {t('common.retry')}
                </Button>
              }
            />
          ) : sales.data.totalCount === 0 ? (
            <EmptyState
              headingLevel="h3"
              title={filtered ? t('staff.sales.noMatchTitle') : t('staff.sales.emptyTitle')}
              body={filtered ? t('staff.sales.noMatchBody') : t('staff.sales.emptyBody')}
            />
          ) : (
            <div
              aria-busy={sales.isFetching}
              className={sales.isFetching ? 'opacity-60 transition-opacity' : undefined}
            >
              <SalesCards items={sales.data.items} showAgent={admin} />
              <SalesTable items={sales.data.items} showAgent={admin} />
            </div>
          )}

          {data && data.totalCount > 0 && pages > 1 && (
            <Pagination
              page={Math.min(state.page, pages)}
              pages={pages}
              label={t('staff.sales.pagination')}
              onChange={(page) => setParams(writeListState({ ...state, page }))}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function AgentSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <StaffPicker
      label={t('admin.policies.agent')}
      staffRole="Agent"
      value={value}
      onChange={onChange}
      emptyOption={{ value: '', label: t('admin.policies.anyAgent') }}
    />
  );
}

function SalesTable({
  items,
  showAgent,
}: {
  items: readonly PolicyResponse[];
  showAgent: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  return (
    <div className="hidden md:block">
      <Table>
        <Caption>{t('staff.sales.caption')}</Caption>
        <THead>
          <Tr className="border-line">
            <Th>{t('staff.sales.columns.policy')}</Th>
            <Th>{t('staff.sales.columns.customer')}</Th>
            <Th>{t('staff.sales.columns.period')}</Th>
            <Th className="text-right">{t('staff.sales.columns.premium')}</Th>
            <Th>{t('claims.columns.status')}</Th>
          </Tr>
        </THead>
        <TBody>
          {items.map((policy) => (
            <Tr key={policy.id} className="border-line">
              <Td>
                <span className="font-medium break-all">{policy.policyNumber}</span>
                <span className="block text-sm text-muted">
                  {product.name(policy.policyTypeCode)} · {policy.vehicle.plateNumber}
                </span>
              </Td>
              <Td>
                <Link
                  to={`/app/customers/${policy.customerId}`}
                  className="break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
                >
                  {policy.customerName}
                </Link>
                {showAgent && (
                  <span className="block text-sm text-muted">
                    {policy.agentName ?? t('admin.policies.selfService')}
                  </span>
                )}
              </Td>
              <Td className="text-sm whitespace-nowrap">
                {format.date(policy.startDate)} – {format.date(policy.endDate)}
              </Td>
              <Td className="text-right whitespace-nowrap">{format.money(policy.premium)}</Td>
              <Td>
                <PolicyStatusBadge status={policy.status} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function SalesCards({
  items,
  showAgent,
}: {
  items: readonly PolicyResponse[];
  showAgent: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  return (
    <ul className="divide-y divide-line border-y border-line md:hidden">
      {items.map((policy) => (
        <li key={policy.id} className="space-y-2 py-4">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 font-medium break-all">{policy.policyNumber}</span>
            <PolicyStatusBadge status={policy.status} />
          </div>
          <Link
            to={`/app/customers/${policy.customerId}`}
            className="block break-words underline decoration-line-strong underline-offset-4"
          >
            {policy.customerName}
          </Link>
          {showAgent && (
            <p className="text-sm text-muted">
              {policy.agentName ?? t('admin.policies.selfService')}
            </p>
          )}
          <p className="text-sm text-muted">
            {product.name(policy.policyTypeCode)} · {policy.vehicle.plateNumber}
          </p>
          <div className="flex flex-wrap justify-between gap-x-4 text-sm tabular">
            <span>
              {format.date(policy.startDate)} – {format.date(policy.endDate)}
            </span>
            <span className="font-medium">{format.money(policy.premium)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
