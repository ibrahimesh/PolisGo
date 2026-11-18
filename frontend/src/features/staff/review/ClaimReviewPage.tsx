import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { isApiError } from '../../../api/errors';
import type { ClaimDetailResponse } from '../../../api/types';
import { useAuth } from '../../../auth/AuthContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { ArrowLeftIcon } from '../../../components/ui/icons';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useFormatters } from '../../../i18n/format';
import { useInvalidateCabinet } from '../../cabinet/queries';
import { ClaimStatusBadge } from '../../claims/ClaimStatusBadge';
import { ClaimTimeline } from '../../claims/ClaimTimeline';
import { useProductName } from '../../policies/useProductName';
import { rolesFor } from '../../workspace/sections';
import { useStaffClaim } from '../queries';
import { ageInDays, needsAttention } from '../queue/queueParams';
import { DecisionPanel } from './DecisionPanel';
import { emptyDraft } from './decisionSchema';
import type { DecisionDraft } from './decisionSchema';
import { ReviewDocuments } from './ReviewDocuments';

// /app/claims/:id for Adjusters and Admins: everything needed to decide, and
// the decision itself.
export function ClaimReviewPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const claim = useStaffClaim(id);

  const back = (
    <Link
      to="/app/claims"
      className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <ArrowLeftIcon />
      {t('staff.review.back')}
    </Link>
  );

  if (claim.isPending) {
    return (
      <div className="space-y-8" aria-busy="true">
        {back}
        <span className="sr-only" role="status">
          {t('common.loading')}
        </span>
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-10 xl:grid-cols-12">
          <Skeleton className="h-96 xl:col-span-7" />
          <Skeleton className="h-96 xl:col-span-5" />
        </div>
      </div>
    );
  }

  if (claim.isError) {
    // Not in this adjuster's reach (another adjuster took it) reads as 404.
    if (isApiError(claim.error) && claim.error.status === 404) {
      return (
        <div className="space-y-4">
          {back}
          <EmptyState
            headingLevel="h1"
            title={t('staff.review.notFoundTitle')}
            body={t('staff.review.notFoundBody')}
            action={
              <ButtonLink to="/app/claims" variant="secondary">
                {t('staff.review.back')}
              </ButtonLink>
            }
          />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {back}
        <ErrorNotice
          error={claim.error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void claim.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return <Review key={id} detail={claim.data} back={back} reload={() => claim.refetch()} />;
}

function Review({
  detail,
  back,
  reload,
}: {
  detail: ClaimDetailResponse;
  back: ReactNode;
  reload: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const invalidate = useInvalidateCabinet();
  const { claim, policy, customer } = detail;
  // Kept here, not in the form: a reload after a conflict must not lose it.
  const [draft, setDraft] = useState<DecisionDraft>(() => emptyDraft(claim.claimedAmount));

  return (
    <div className="space-y-10">
      <PageHeader
        before={back}
        title={t('claimDetail.title', { number: claim.claimNumber })}
        description={`${customer.fullName} · ${product.name(policy.policyTypeCode)} · ${policy.vehicle.plateNumber}`}
      />

      {/* DOM order summary, decision, details: on a phone the decision sits
          right under the facts; on a wide screen it is a sticky side column. */}
      <div className="grid gap-10 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <Card
            variant="paper"
            as="section"
            aria-labelledby="review-summary-title"
            className="p-6 sm:p-8"
          >
            <h2 id="review-summary-title" className="sr-only">
              {t('claimDetail.summary')}
            </h2>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-line pb-5">
              <p className="font-serif text-xl break-all tabular">{claim.claimNumber}</p>
              <div className="flex flex-wrap gap-2">
                {needsAttention(claim) && (
                  <Badge tone="paper">
                    {t('staff.queue.ageDays', { count: ageInDays(claim.createdAt) })}
                  </Badge>
                )}
                <ClaimStatusBadge status={claim.status} onPaper />
              </div>
            </div>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <Fact label={t('claimDetail.claimed')}>
                <span className="font-serif text-2xl tabular">
                  {format.money(claim.claimedAmount)}
                </span>
              </Fact>
              <Fact label={t('claimDetail.approved')}>
                <span className="font-serif text-2xl tabular">
                  {claim.approvedAmount === null ? '—' : format.money(claim.approvedAmount)}
                </span>
              </Fact>
              <Fact label={t('claimWizard.incident.date')}>
                {format.date(claim.incidentDate.slice(0, 10))}
                {claim.incidentType && (
                  <span className="block text-sm text-paper-muted">
                    {t(`incidentType.${claim.incidentType}`)}
                  </span>
                )}
              </Fact>
              <Fact label={t('claimWizard.incident.location')}>
                <span className="break-words">{claim.location ?? '—'}</span>
              </Fact>
              <Fact label={t('claimDetail.filed')}>{format.dateTime(claim.createdAt)}</Fact>
              <Fact label={t('staff.review.adjuster')}>
                {claim.assignedAdjusterName ?? t('staff.queue.unassigned')}
              </Fact>
            </dl>
          </Card>
        </div>

        <div className="min-w-0 xl:sticky xl:top-24 xl:col-span-5 xl:col-start-8 xl:row-span-2 xl:row-start-1 xl:self-start">
          <DecisionPanel
            detail={detail}
            draft={draft}
            onDraftChange={setDraft}
            reload={reload}
            onDone={async () => {
              setDraft(emptyDraft(claim.claimedAmount));
              await invalidate();
            }}
          />
        </div>

        <div className="min-w-0 space-y-10 xl:col-span-7">
          <section aria-labelledby="review-description-title" className="space-y-3">
            <h2 id="review-description-title" className="text-2xl">
              {t('claimWizard.incident.description')}
            </h2>
            <p className="leading-relaxed break-words whitespace-pre-line">{claim.description}</p>
          </section>

          <Context detail={detail} />
          <ReviewDocuments claimId={claim.id} documents={detail.documents} />
          <ClaimTimeline history={detail.history} audience="staff" />
        </div>
      </div>
    </div>
  );
}

// Who the customer is and what the policy covers, beside the claim.
function Context({ detail }: { detail: ClaimDetailResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const { user } = useAuth();
  const { policy, customer } = detail;
  // Only roles with the customer directory get a link into it.
  const canOpenCustomer = user !== null && rolesFor('customers').includes(user.role);

  return (
    <section aria-labelledby="review-context-title" className="space-y-4">
      <h2 id="review-context-title" className="text-2xl">
        {t('staff.review.context')}
      </h2>
      <dl className="grid gap-x-8 border-y border-line sm:grid-cols-2">
        <Row label={t('staff.review.customer')}>
          {canOpenCustomer ? (
            <Link
              to={`/app/customers/${customer.id}`}
              className="break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
            >
              {customer.fullName}
            </Link>
          ) : (
            <span className="break-words">{customer.fullName}</span>
          )}
        </Row>
        <Row label={t('staff.review.contact')}>
          <a
            href={`mailto:${customer.email}`}
            className="block break-all underline decoration-line-strong underline-offset-4 hover:decoration-current"
          >
            {customer.email}
          </a>
          <a
            href={`tel:${customer.phone.replace(/\s+/g, '')}`}
            className="block tabular underline decoration-line-strong underline-offset-4 hover:decoration-current"
          >
            {customer.phone}
          </a>
        </Row>
        <Row label={t('claimDetail.policy')}>
          <span className="break-all tabular">{policy.policyNumber}</span>
          <span className="block text-sm text-muted">{product.name(policy.policyTypeCode)}</span>
        </Row>
        <Row label={t('staff.review.cover')}>
          {format.date(policy.startDate)} – {format.date(policy.endDate)}
          <span className="block text-sm text-muted">
            {policy.vehicle.make} {policy.vehicle.model} {policy.vehicle.year} ·{' '}
            {policy.vehicle.plateNumber}
          </span>
        </Row>
      </dl>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-paper-line py-4 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
      <dt className="text-sm font-medium text-paper-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
