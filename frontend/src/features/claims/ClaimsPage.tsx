import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { ClaimResponse } from '../../api/types';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { SearchIcon } from '../../components/ui/icons';
import { Input } from '../../components/ui/Input';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Caption, Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useFormatters } from '../../i18n/format';
import { useDebouncedValue } from '../../lib/hooks';
import { useClaims } from '../cabinet/queries';
import { useProductName } from '../policies/useProductName';
import {
  DEFAULT_CLAIM_LIST,
  hasClaimFilters,
  readClaimList,
  SORT_OPTIONS,
  STATUS_FILTERS,
  toClaimQuery,
  writeClaimList,
} from './claimListParams';
import type { ClaimListState } from './claimListParams';
import { CLAIM_RULES } from './claimRules';
import { ClaimStatusBadge } from './ClaimStatusBadge';

export function ClaimsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readClaimList(params);
  const resultsId = useId();

  const [searchText, setSearchText] = useState(state.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);

  const update = (patch: Partial<ClaimListState>) =>
    setParams(writeClaimList({ ...state, page: 1, ...patch }), { replace: true });

  useEffect(() => {
    if (debouncedSearch.trim() !== state.search.trim()) update({ search: debouncedSearch });
    // Only the debounced text should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const claims = useClaims(toClaimQuery(state));
  const data = claims.data;
  const filtered = hasClaimFilters(state);
  const pages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('claims.title')}
        description={t('claims.lead')}
        actions={<ButtonLink to="/app/claims/new">{t('claims.file')}</ButtonLink>}
      />

      <form
        role="search"
        aria-label={t('claims.filters')}
        aria-controls={resultsId}
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: searchText });
        }}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]"
      >
        <Input
          label={t('claims.search')}
          type="search"
          value={searchText}
          maxLength={CLAIM_RULES.maxSearch}
          placeholder={t('claims.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
          trailing={
            <span className="grid size-10 place-items-center text-muted" aria-hidden="true">
              <SearchIcon />
            </span>
          }
        />
        <Select
          label={t('claims.status')}
          value={state.status}
          onChange={(event) => update({ status: event.target.value as ClaimListState['status'] })}
          options={[
            { value: '', label: t('claims.allStatuses') },
            ...STATUS_FILTERS.map((status) => ({
              value: status,
              label: status === 'open' ? t('claims.openOnly') : t(`claimStatus.${status}`),
            })),
          ]}
        />
        <Select
          label={t('claims.sort')}
          value={state.sort}
          onChange={(event) => update({ sort: event.target.value as ClaimListState['sort'] })}
          options={SORT_OPTIONS.map((option) => ({
            value: option.id,
            label: t(`claims.sortOptions.${option.id}`),
          }))}
        />
      </form>

      <section id={resultsId} aria-labelledby={`${resultsId}-title`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${resultsId}-title`} className="sr-only">
            {t('claims.results')}
          </h2>
          <p aria-live="polite" className="text-sm text-muted">
            {data ? t('claims.count', { count: data.totalCount }) : ' '}
          </p>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchText('');
                setParams(writeClaimList(DEFAULT_CLAIM_LIST), { replace: true });
              }}
            >
              {t('policies.clearFilters')}
            </Button>
          )}
        </div>

        {claims.isPending ? (
          <ListSkeleton />
        ) : claims.isError ? (
          <ErrorNotice
            error={claims.error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void claims.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : claims.data.totalCount === 0 ? (
          filtered ? (
            <EmptyState
              title={t('claims.noMatchTitle')}
              body={t('claims.noMatchBody')}
              headingLevel="h3"
            />
          ) : (
            <EmptyState
              title={t('claims.emptyTitle')}
              body={t('claims.emptyBody')}
              headingLevel="h3"
              action={<ButtonLink to="/app/claims/new">{t('claims.file')}</ButtonLink>}
            />
          )
        ) : (
          <div
            aria-busy={claims.isFetching}
            className={claims.isFetching ? 'opacity-60 transition-opacity' : undefined}
          >
            <ClaimCards items={claims.data.items} />
            <ClaimTable items={claims.data.items} />
          </div>
        )}

        {data && data.totalCount > 0 && pages > 1 && (
          <Pagination
            page={Math.min(state.page, pages)}
            pages={pages}
            label={t('claims.pagination')}
            onChange={(page) => setParams(writeClaimList({ ...state, page }))}
          />
        )}
      </section>
    </div>
  );
}

function ClaimTable({ items }: { items: readonly ClaimResponse[] }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  return (
    <div className="relative hidden overflow-x-auto md:block">
      <Table>
        <Caption>{t('claims.caption')}</Caption>
        <THead>
          <Tr className="border-line">
            <Th>{t('claims.columns.number')}</Th>
            <Th>{t('claims.columns.incident')}</Th>
            <Th className="text-right">{t('claims.columns.amount')}</Th>
            <Th>{t('claims.columns.updated')}</Th>
            <Th>{t('claims.columns.status')}</Th>
          </Tr>
        </THead>
        <TBody>
          {items.map((claim) => (
            <Tr key={claim.id} className="border-line">
              <Td>
                <Link
                  to={`/app/claims/${claim.id}`}
                  className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-current"
                >
                  {claim.claimNumber}
                </Link>
                <span className="block text-sm text-muted">
                  {product.name(claim.policyTypeCode)} · {claim.policyNumber}
                </span>
              </Td>
              <Td className="text-sm">
                {format.date(claim.incidentDate.slice(0, 10))}
                {claim.incidentType && (
                  <span className="block text-muted">
                    {t(`incidentType.${claim.incidentType}`)}
                  </span>
                )}
              </Td>
              <Td className="text-right whitespace-nowrap">
                {format.money(claim.claimedAmount)}
                {claim.approvedAmount !== null && (
                  <span className="block text-sm text-muted">
                    {t('claims.approvedAmount', { amount: format.money(claim.approvedAmount) })}
                  </span>
                )}
              </Td>
              <Td className="text-sm whitespace-nowrap">{format.dateTime(claim.updatedAt)}</Td>
              <Td>
                <ClaimStatusBadge status={claim.status} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

// Phones: one card per claim instead of a sideways-scrolling table.
function ClaimCards({ items }: { items: readonly ClaimResponse[] }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  return (
    <ul className="divide-y divide-line border-y border-line md:hidden">
      {items.map((claim) => (
        <li key={claim.id} className="space-y-2 py-4">
          <div className="flex items-start justify-between gap-3">
            <Link
              to={`/app/claims/${claim.id}`}
              className="min-w-0 font-medium break-all underline decoration-line-strong underline-offset-4"
            >
              {claim.claimNumber}
            </Link>
            <ClaimStatusBadge status={claim.status} />
          </div>
          <p className="text-sm text-muted">
            {product.name(claim.policyTypeCode)} · {claim.policyNumber}
            {claim.incidentType && <> · {t(`incidentType.${claim.incidentType}`)}</>}
          </p>
          <div className="flex flex-wrap justify-between gap-x-4 text-sm tabular">
            <span>{format.date(claim.incidentDate.slice(0, 10))}</span>
            <span className="font-medium">{format.money(claim.claimedAmount)}</span>
          </div>
        </li>
      ))}
    </ul>
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
