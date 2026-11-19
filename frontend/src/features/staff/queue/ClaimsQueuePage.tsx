import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { claimsApi } from '../../../api/endpoints';
import { CLAIM_STATUSES } from '../../../api/types';
import type { ClaimResponse, ClaimStatus } from '../../../api/types';
import { useAuth } from '../../../auth/AuthContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { SearchIcon } from '../../../components/ui/icons';
import { DateFilterField } from '../../../components/ui/DateFilterField';
import { Input } from '../../../components/ui/Input';
import { todayIso } from '../../../lib/dates';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Caption, Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { useFormatters } from '../../../i18n/format';
import { useDebouncedValue } from '../../../lib/hooks';
import { ClaimStatusBadge } from '../../claims/ClaimStatusBadge';
import { CLAIM_RULES } from '../../claims/claimRules';
import { useProductName } from '../../policies/useProductName';
import { ExportButton } from '../ExportButton';
import { ListSkeleton } from '../ListSkeleton';
import { useClaimQueue, useStaffOverview } from '../queries';
import { exportFileName } from '../saveBlob';
import {
  ageInDays,
  DEFAULT_QUEUE,
  hasQueueFilters,
  needsAttention,
  QUEUE_PAGE_SIZE,
  QUEUE_SORTS,
  QUEUE_VIEWS,
  readQueue,
  toQueueFilter,
  toQueueQuery,
  writeQueue,
} from './queueParams';
import type { QueueState, QueueView } from './queueParams';

export function ClaimsQueuePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readQueue(params);
  const resultsId = useId();

  const [searchText, setSearchText] = useState(state.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  const update = (patch: Partial<QueueState>) =>
    setParams(writeQueue({ ...state, page: 1, ...patch }), { replace: true });

  useEffect(() => {
    if (debouncedSearch.trim() !== state.search.trim()) update({ search: debouncedSearch });
    // Only the debounced text should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const queue = useClaimQueue(toQueueQuery(state));
  const data = queue.data;
  const pages = data ? Math.max(1, Math.ceil(data.totalCount / QUEUE_PAGE_SIZE)) : 1;
  const filtered = hasQueueFilters(state);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('staff.queue.title')}
        description={t('staff.queue.lead')}
        actions={
          <ExportButton
            fileName={exportFileName('claims')}
            disabled={data?.totalCount === 0}
            fetchCsv={() => claimsApi.exportCsv(toQueueFilter(state))}
          />
        }
      />

      <ViewNav state={state} />

      <form
        role="search"
        aria-label={t('staff.queue.filters')}
        aria-controls={resultsId}
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: searchText });
        }}
        className={cx(
          'grid gap-4 md:grid-cols-2',
          state.view === 'all'
            ? 'xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]'
            : 'xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]',
        )}
      >
        <Input
          label={t('staff.queue.search')}
          type="search"
          value={searchText}
          maxLength={CLAIM_RULES.maxSearch}
          placeholder={t('staff.queue.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
          trailing={
            <span className="grid size-10 place-items-center text-muted" aria-hidden="true">
              <SearchIcon />
            </span>
          }
        />
        {state.view === 'all' && (
          <Select
            label={t('claims.status')}
            value={state.status}
            onChange={(event) => update({ status: event.target.value as ClaimStatus | '' })}
            options={[
              { value: '', label: t('claims.allStatuses') },
              ...CLAIM_STATUSES.map((status) => ({
                value: status,
                label: t(`claimStatus.${status}`),
              })),
            ]}
          />
        )}
        <Select
          label={t('claims.sort')}
          value={state.sort}
          onChange={(event) => update({ sort: event.target.value as QueueState['sort'] })}
          options={QUEUE_SORTS.map((option) => ({
            value: option.id,
            label: t(`staff.queue.sort.${option.id}`),
          }))}
        />
        <DateFilterField
          id="queue-from"
          label={t('staff.queue.incidentFrom')}
          value={state.from}
          max={state.to || todayIso()}
          onCommit={(from) => update({ from })}
        />
        <DateFilterField
          id="queue-to"
          label={t('staff.queue.incidentTo')}
          value={state.to}
          min={state.from || undefined}
          max={todayIso()}
          onCommit={(to) => update({ to })}
        />
      </form>

      <section id={resultsId} aria-labelledby={`${resultsId}-title`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${resultsId}-title`} className="sr-only">
            {t(`staff.queue.views.${state.view}`)}
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
                setParams(writeQueue({ ...DEFAULT_QUEUE, view: state.view }), { replace: true });
              }}
            >
              {t('policies.clearFilters')}
            </Button>
          )}
        </div>

        {queue.isPending ? (
          <ListSkeleton />
        ) : queue.isError ? (
          <ErrorNotice
            error={queue.error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void queue.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : queue.data.totalCount === 0 ? (
          <EmptyState
            headingLevel="h3"
            title={
              filtered ? t('staff.queue.noMatchTitle') : t(`staff.queue.empty.${state.view}.title`)
            }
            body={
              filtered ? t('staff.queue.noMatchBody') : t(`staff.queue.empty.${state.view}.body`)
            }
          />
        ) : (
          <div
            aria-busy={queue.isFetching}
            className={queue.isFetching ? 'opacity-60 transition-opacity' : undefined}
          >
            <QueueCards items={queue.data.items} />
            <QueueTable items={queue.data.items} />
          </div>
        )}

        {data && data.totalCount > 0 && pages > 1 && (
          <Pagination
            page={Math.min(state.page, pages)}
            pages={pages}
            label={t('claims.pagination')}
            onChange={(page) => setParams(writeQueue({ ...state, page }))}
          />
        )}
      </section>
    </div>
  );
}

// The attention views as links: each is a URL, so it can be bookmarked and
// the current one is announced with aria-current.
function ViewNav({ state }: { state: QueueState }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { user } = useAuth();
  const overview = useStaffOverview();
  const desk = overview.data?.claims;
  // Counts only where they match the view's list exactly: "mine" filters by
  // assignment, which the desk count does for adjusters only.
  const counts: Partial<Record<QueueView, number>> = desk
    ? {
        waiting: desk.waitingForReview,
        toPay: desk.awaitingPayment,
        ...(user?.role === 'Adjuster' ? { mine: desk.inReview } : {}),
      }
    : {};

  return (
    <nav aria-label={t('staff.queue.viewsLabel')}>
      <ul className="flex flex-wrap gap-2">
        {QUEUE_VIEWS.map((view) => {
          const current = view === state.view;
          const count = counts[view];
          return (
            <li key={view}>
              <Link
                to={{ search: writeQueue({ ...DEFAULT_QUEUE, view, sort: state.sort }).toString() }}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'inline-flex min-h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors duration-150',
                  current
                    ? 'border-accent bg-surface-2 text-text'
                    : 'border-line-strong text-muted hover:bg-surface-2 hover:text-text',
                )}
              >
                {t(`staff.queue.views.${view}`)}
                {count !== undefined && (
                  <span className="text-muted tabular">{format.integer(count)}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Age({ claim }: { claim: ClaimResponse }) {
  const { t } = useTranslation();
  const days = ageInDays(claim.createdAt);
  const label = t('staff.queue.ageDays', { count: days });
  return needsAttention(claim) ? (
    <Badge tone="warning">
      {label}
      <span className="sr-only">, {t('staff.queue.overdue')}</span>
    </Badge>
  ) : (
    <span className="text-sm whitespace-nowrap text-muted">{label}</span>
  );
}

function QueueTable({ items }: { items: readonly ClaimResponse[] }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  return (
    <div className="hidden md:block">
      <Table>
        <Caption>{t('staff.queue.caption')}</Caption>
        <THead>
          <Tr className="border-line">
            <Th>{t('claims.columns.number')}</Th>
            <Th>{t('staff.queue.columns.customer')}</Th>
            <Th className="text-right">{t('claims.columns.amount')}</Th>
            <Th>{t('staff.queue.columns.age')}</Th>
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
              <Td>
                <span className="block max-w-56 truncate" title={claim.customerName}>
                  {claim.customerName}
                </span>
                <span className="block text-sm text-muted">
                  {claim.assignedAdjusterName ?? t('staff.queue.unassigned')}
                </span>
              </Td>
              <Td className="text-right whitespace-nowrap">
                {format.money(claim.claimedAmount)}
                {claim.approvedAmount !== null && (
                  <span className="block text-sm text-muted">
                    {t('claims.approvedAmount', { amount: format.money(claim.approvedAmount) })}
                  </span>
                )}
              </Td>
              <Td>
                <Age claim={claim} />
                <span className="block text-sm text-muted">
                  {format.date(claim.createdAt.slice(0, 10))}
                </span>
              </Td>
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
function QueueCards({ items }: { items: readonly ClaimResponse[] }) {
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
          <p className="break-words">{claim.customerName}</p>
          <p className="text-sm text-muted">
            {product.name(claim.policyTypeCode)} · {claim.policyNumber} ·{' '}
            {claim.assignedAdjusterName ?? t('staff.queue.unassigned')}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm tabular">
            <Age claim={claim} />
            <span className="font-medium">{format.money(claim.claimedAmount)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
