import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { PolicyResponse } from '../../api/types';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../../components/ui/icons';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Caption, Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useFormatters } from '../../i18n/format';
import { useDebouncedValue } from '../../lib/hooks';
import { usePolicies } from '../cabinet/queries';
import { usePolicyTypes } from '../landing/usePolicyTypes';
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
} from './listParams';
import type { ListState } from './listParams';
import { PolicyStatusBadge } from './PolicyStatusBadge';
import { useProductName } from './useProductName';

export function PoliciesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readListState(params);
  const types = usePolicyTypes();
  const resultsId = useId();

  // The search box is typed into; the URL (and the request) follow 300ms later.
  const [searchText, setSearchText] = useState(state.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);

  const update = (patch: Partial<ListState>) =>
    // Any filter change returns to the first page; replace keeps typing out of history.
    setParams(writeListState({ ...state, page: 1, ...patch }), { replace: true });

  useEffect(() => {
    if (debouncedSearch.trim() !== state.search.trim()) update({ search: debouncedSearch });
    // Only the debounced text should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const policies = usePolicies(toQuery(state));
  const data = policies.data;
  const filtered = hasFilters(state);
  const pages = data ? pageCount(data.totalCount, data.pageSize) : 1;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('policies.title')}
        description={t('policies.lead')}
        actions={<ButtonLink to="/app/buy">{t('overview.buy')}</ButtonLink>}
      />

      <form
        role="search"
        aria-label={t('policies.filters')}
        aria-controls={resultsId}
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: searchText });
        }}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
      >
        <Input
          label={t('policies.search')}
          type="search"
          value={searchText}
          maxLength={SEARCH_MAX}
          placeholder={t('policies.searchPlaceholder')}
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
          onChange={(event) => update({ status: event.target.value as ListState['status'] })}
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
              label: t(`calculator.products.${type.code}`, { defaultValue: type.code }),
            })),
          ]}
        />
        <Select
          label={t('policies.sort')}
          value={state.sort}
          onChange={(event) => update({ sort: event.target.value as ListState['sort'] })}
          options={SORT_OPTIONS.map((option) => ({
            value: option.id,
            label: t(`policies.sortOptions.${option.id}`),
          }))}
        />
      </form>

      <section id={resultsId} aria-labelledby={`${resultsId}-title`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${resultsId}-title`} className="sr-only">
            {t('policies.results')}
          </h2>
          {/* Announces the outcome of each filter change. */}
          <p aria-live="polite" className="text-sm text-muted">
            {data ? t('policies.count', { count: data.totalCount }) : ' '}
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

        {policies.isPending ? (
          <ListSkeleton />
        ) : policies.isError ? (
          <ErrorNotice
            error={policies.error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void policies.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : policies.data.totalCount === 0 ? (
          filtered ? (
            <EmptyState
              title={t('policies.noMatchTitle')}
              body={t('policies.noMatchBody')}
              headingLevel="h3"
            />
          ) : (
            <EmptyState
              title={t('policies.emptyTitle')}
              body={t('policies.emptyBody')}
              headingLevel="h3"
              action={<ButtonLink to="/app/buy">{t('overview.empty.action')}</ButtonLink>}
            />
          )
        ) : (
          <div
            aria-busy={policies.isFetching}
            className={policies.isFetching ? 'opacity-60 transition-opacity' : undefined}
          >
            <PolicyCards items={policies.data.items} />
            <PolicyTable items={policies.data.items} />
          </div>
        )}

        {data && data.totalCount > 0 && pages > 1 && (
          <Pagination
            page={Math.min(state.page, pages)}
            pages={pages}
            onChange={(page) => setParams(writeListState({ ...state, page }))}
          />
        )}
      </section>
    </div>
  );
}

function PolicyTable({ items }: { items: readonly PolicyResponse[] }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  return (
    <div className="hidden md:block">
      <Table>
        <Caption>{t('policies.caption')}</Caption>
        <THead>
          <Tr className="border-line">
            <Th>{t('policies.columns.number')}</Th>
            <Th>{t('policies.columns.vehicle')}</Th>
            <Th>{t('policies.columns.period')}</Th>
            <Th className="text-right">{t('policies.columns.premium')}</Th>
            <Th>{t('policies.columns.status')}</Th>
          </Tr>
        </THead>
        <TBody>
          {items.map((policy) => (
            <Tr key={policy.id} className="border-line">
              <Td>
                <Link
                  to={`/app/policies/${policy.id}`}
                  className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-current"
                >
                  {policy.policyNumber}
                </Link>
                <span className="block text-sm text-muted">
                  {product.name(policy.policyTypeCode)}
                </span>
              </Td>
              <Td>
                {policy.vehicle.plateNumber}
                <span className="block text-sm text-muted">
                  {policy.vehicle.make} {policy.vehicle.model}
                </span>
              </Td>
              <Td className="text-sm whitespace-nowrap">
                {format.date(policy.startDate)} – {format.date(policy.endDate)}
              </Td>
              <Td className="text-right whitespace-nowrap">
                {format.money(policy.premium, policy.currency)}
              </Td>
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

// Phones: one card per policy instead of a sideways-scrolling table.
function PolicyCards({ items }: { items: readonly PolicyResponse[] }) {
  const format = useFormatters();
  const product = useProductName();
  return (
    <ul className="divide-y divide-line border-y border-line md:hidden">
      {items.map((policy) => (
        <li key={policy.id} className="space-y-2 py-4">
          <div className="flex items-start justify-between gap-3">
            <Link
              to={`/app/policies/${policy.id}`}
              className="min-w-0 font-medium break-all underline decoration-line-strong underline-offset-4"
            >
              {policy.policyNumber}
            </Link>
            <PolicyStatusBadge status={policy.status} />
          </div>
          <p className="text-sm text-muted">
            {product.name(policy.policyTypeCode)} · {policy.vehicle.plateNumber} ·{' '}
            {policy.vehicle.make} {policy.vehicle.model}
          </p>
          <div className="flex flex-wrap justify-between gap-x-4 text-sm tabular">
            <span>
              {format.date(policy.startDate)} – {format.date(policy.endDate)}
            </span>
            <span className="font-medium">{format.money(policy.premium, policy.currency)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('policies.pagination')}
      className="flex items-center justify-between gap-4 border-t border-line pt-4"
    >
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeftIcon />
        {t('policies.previous')}
      </Button>
      <p className="text-sm text-muted tabular">{t('policies.pageOf', { page, pages })}</p>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        {t('policies.next')}
        <ChevronRightIcon />
      </Button>
    </nav>
  );
}

function ListSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="divide-y divide-line border-y border-line">
      <span className="sr-only" role="status">
        {t('common.loading')}
      </span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between gap-6 py-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="hidden h-5 w-40 md:block" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}
