import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ClaimsDeskSummary, SalesSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFormatters } from '../../i18n/format';
import { ClaimStatusBadge } from '../claims/ClaimStatusBadge';
import { PolicyStatusBadge } from '../policies/PolicyStatusBadge';
import { useProductName } from '../policies/useProductName';
import { useStaffOverview } from './queries';
import { ageInDays } from './queue/queueParams';
import { writeQueue, DEFAULT_QUEUE } from './queue/queueParams';
import type { QueueView } from './queue/queueParams';
import { SalesSummaryTiles } from './sales/SalesSummaryTiles';
import { CountUp } from '../../motion/CountUp';

// /app for staff: what is waiting on each desk the role works, from
// GET /api/staff/overview (the same visibility as the lists it links to).
export function StaffOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const overview = useStaffOverview();
  if (!user) return null;

  return (
    <div className="space-y-12">
      <PageHeader
        title={t('staff.overview.greeting', { name: user.fullName })}
        description={t(`staff.overview.lead.${user.role}`)}
      />

      {overview.isPending ? (
        <div aria-busy="true" className="space-y-6">
          <span className="sr-only" role="status">
            {t('common.loading')}
          </span>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : overview.isError ? (
        <ErrorNotice
          error={overview.error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void overview.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <>
          {overview.data.claims && <ClaimsDesk desk={overview.data.claims} />}
          {overview.data.sales && <Sales sales={overview.data.sales} />}
        </>
      )}
    </div>
  );
}

const queueLink = (view: QueueView) =>
  `/app/claims?${writeQueue({ ...DEFAULT_QUEUE, view }).toString()}`.replace(/\?$/, '');

function ClaimsDesk({ desk }: { desk: ClaimsDeskSummary }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const tiles = [
    { id: 'waiting', value: desk.waitingForReview, to: queueLink('waiting') },
    { id: 'inReview', value: desk.inReview, to: queueLink('mine') },
    { id: 'toPay', value: desk.awaitingPayment, to: queueLink('toPay') },
    { id: 'decided', value: desk.decidedLast30Days, to: null },
  ] as const;

  return (
    <section aria-labelledby="desk-claims-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 id="desk-claims-title" className="text-2xl">
            {t('staff.overview.claimsTitle')}
          </h2>
          <p className="text-muted">
            {desk.oldestWaitingSince
              ? t('staff.overview.oldestWaiting', {
                  count: ageInDays(desk.oldestWaitingSince),
                })
              : t('staff.overview.queueClear')}
          </p>
        </div>
        <ButtonLink to="/app/claims" variant="secondary">
          {t('staff.overview.openQueue')}
        </ButtonLink>
      </div>

      <dl className="grid stagger gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.id} className="space-y-1 bg-bg p-5">
            <dt className="text-sm font-medium text-muted">
              {t(`staff.overview.tiles.${tile.id}`)}
            </dt>
            <dd className="font-serif text-2xl tabular">
              {tile.to ? (
                <Link
                  to={tile.to}
                  className="underline decoration-line-strong underline-offset-4 hover:decoration-current"
                >
                  <CountUp value={tile.value} format={format.integer} />
                  <span className="sr-only">, {t('staff.overview.openList')}</span>
                </Link>
              ) : (
                format.integer(tile.value)
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3">
        <h3 className="text-xl">{t('staff.overview.recentDecisions')}</h3>
        {desk.recentDecisions.length === 0 ? (
          <p className="text-muted">{t('staff.overview.noDecisions')}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {desk.recentDecisions.map((decision) => (
              <li
                key={`${decision.claimId}-${decision.decidedAt}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
              >
                <div className="min-w-0">
                  <Link
                    to={`/app/claims/${decision.claimId}`}
                    className="font-medium break-all underline decoration-line-strong underline-offset-4 hover:decoration-current"
                  >
                    {decision.claimNumber}
                  </Link>
                  <span className="block text-sm break-words text-muted">
                    {decision.customerName} · {format.dateTime(decision.decidedAt)} ·{' '}
                    {decision.decidedBy}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular">
                    {format.money(decision.approvedAmount ?? decision.claimedAmount)}
                  </span>
                  <ClaimStatusBadge status={decision.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Sales({ sales }: { sales: SalesSummary }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  return (
    <section aria-labelledby="desk-sales-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="desk-sales-title" className="text-2xl">
          {t('staff.overview.salesTitle')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/app/customers" variant="secondary">
            {t('staff.overview.openCustomers')}
          </ButtonLink>
          <ButtonLink to="/app/sales" variant="secondary">
            {t('staff.overview.openSales')}
          </ButtonLink>
        </div>
      </div>

      <SalesSummaryTiles />

      <div className="space-y-3">
        <h3 className="text-xl">{t('staff.overview.recentSales')}</h3>
        {sales.recentPolicies.length === 0 ? (
          <p className="text-muted">{t('staff.overview.noSales')}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {sales.recentPolicies.map((policy) => (
              <li
                key={policy.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
              >
                <div className="min-w-0">
                  <Link
                    to={`/app/customers/${policy.customerId}`}
                    className="font-medium break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
                  >
                    {policy.customerName}
                  </Link>
                  <span className="block text-sm break-all text-muted">
                    {policy.policyNumber} · {product.name(policy.policyTypeCode)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular">{format.money(policy.premium)}</span>
                  <PolicyStatusBadge status={policy.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
