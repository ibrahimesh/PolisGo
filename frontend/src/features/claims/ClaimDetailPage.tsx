import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { cabinetApi } from '../../api/endpoints';
import { isApiError } from '../../api/errors';
import type {
  ClaimDetailResponse,
  ClaimDocumentResponse,
  ClaimHistoryEntry,
} from '../../api/types';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { ArrowLeftIcon, DownloadIcon, FileIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastProvider';
import { useFormatters } from '../../i18n/format';
import { useClaim, useClaimUpdates, useInvalidateCabinet } from '../cabinet/queries';
import { useProductName } from '../policies/useProductName';
import { ClaimStatusBadge } from './ClaimStatusBadge';
import { ClaimTimeline } from './ClaimTimeline';
import { downloadClaimDocument } from './downloadDocument';
import { FileUploader } from './upload/FileUploader';
import { useFileQueue } from './upload/useFileQueue';
import { WithdrawDialog } from './WithdrawDialog';

const DECISIONS = new Set(['Approved', 'Rejected']);

export function ClaimDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const claim = useClaim(id);

  const back = (
    <Link
      to="/app/claims"
      className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <ArrowLeftIcon />
      {t('claimDetail.back')}
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
          <Skeleton className="h-80 xl:col-span-5" />
          <Skeleton className="h-80 xl:col-span-7" />
        </div>
      </div>
    );
  }

  if (claim.isError) {
    // Someone else's claim and a missing one answer the same 404.
    if (isApiError(claim.error) && claim.error.status === 404) {
      return (
        <div className="space-y-4">
          {back}
          <EmptyState
            headingLevel="h1"
            title={t('claimDetail.notFoundTitle')}
            body={t('claimDetail.notFoundBody')}
            action={
              <ButtonLink to="/app/claims" variant="secondary">
                {t('claimDetail.back')}
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

  return <Detail detail={claim.data} back={back} />;
}

function Detail({ detail, back }: { detail: ClaimDetailResponse; back: ReactNode }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { claim, policy, history } = detail;
  const decision = [...history].reverse().find((entry) => DECISIONS.has(entry.toStatus));

  // Opening the claim is reading its update: clear the bell's dot for it.
  const updates = useClaimUpdates();
  const invalidate = useInvalidateCabinet();
  const unreadHere = updates.data?.some((u) => u.claimId === claim.id && u.readAt === null);
  useEffect(() => {
    if (unreadHere) void cabinetApi.markClaimUpdateRead(claim.id).then(invalidate, () => undefined);
  }, [unreadHere, claim.id, invalidate]);

  return (
    <div className="space-y-10">
      <PageHeader
        before={back}
        title={t('claimDetail.title', { number: claim.claimNumber })}
        description={`${product.name(policy.policyTypeCode)} · ${policy.vehicle.plateNumber}`}
        actions={
          detail.canWithdraw ? (
            <Button variant="secondary" onClick={() => setWithdrawOpen(true)}>
              {t('claimDetail.withdraw')}
            </Button>
          ) : undefined
        }
      />

      {decision && <Decision detail={detail} entry={decision} />}
      {claim.status === 'Withdrawn' && (
        <p className="rounded-sm border border-line-strong px-4 py-3 text-muted">
          {t('claimDetail.withdrawnNote')}
        </p>
      )}

      <div className="grid gap-10 xl:grid-cols-12">
        <Card
          variant="paper"
          as="section"
          aria-labelledby="claim-summary-title"
          className="h-fit p-6 sm:p-8 xl:col-span-5"
        >
          <h2 id="claim-summary-title" className="sr-only">
            {t('claimDetail.summary')}
          </h2>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-line pb-5">
            <p className="font-serif text-xl break-all tabular">{claim.claimNumber}</p>
            <ClaimStatusBadge status={claim.status} onPaper />
          </div>
          <dl className="divide-y divide-paper-line">
            <Fact label={t('claimDetail.claimed')}>
              <span className="font-serif text-2xl tabular">
                {format.money(claim.claimedAmount)}
              </span>
            </Fact>
            {claim.approvedAmount !== null && (
              <Fact label={t('claimDetail.approved')}>
                <span className="font-serif text-2xl tabular">
                  {format.money(claim.approvedAmount)}
                </span>
              </Fact>
            )}
            <Fact label={t('claimWizard.incident.date')}>
              {format.date(claim.incidentDate.slice(0, 10))}
              {claim.incidentType && (
                <span className="block text-sm text-paper-muted">
                  {t(`incidentType.${claim.incidentType}`)}
                </span>
              )}
            </Fact>
            {claim.location && (
              <Fact label={t('claimWizard.incident.location')}>
                <span className="break-words">{claim.location}</span>
              </Fact>
            )}
            <Fact label={t('claimDetail.policy')}>
              <Link
                to={`/app/policies/${policy.id}`}
                className="break-all underline decoration-paper-line underline-offset-4 hover:decoration-current"
              >
                {policy.policyNumber}
              </Link>
              <span className="block text-sm text-paper-muted">
                {policy.vehicle.make} {policy.vehicle.model} · {format.date(policy.startDate)} –{' '}
                {format.date(policy.endDate)}
              </span>
            </Fact>
            <Fact label={t('claimDetail.filed')}>{format.dateTime(claim.createdAt)}</Fact>
          </dl>
        </Card>

        <div className="space-y-10 xl:col-span-7">
          <section aria-labelledby="claim-description-title" className="space-y-3">
            <h2 id="claim-description-title" className="text-2xl">
              {t('claimWizard.incident.description')}
            </h2>
            <p className="leading-relaxed break-words whitespace-pre-line">{claim.description}</p>
          </section>
          <ClaimTimeline history={history} />
          <Documents detail={detail} />
        </div>
      </div>

      <WithdrawDialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        claimId={claim.id}
        claimNumber={claim.claimNumber}
      />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-4">
      <dt className="text-sm font-medium text-paper-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Decision({ detail, entry }: { detail: ClaimDetailResponse; entry: ClaimHistoryEntry }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const approved = entry.toStatus === 'Approved';
  return (
    <section
      aria-labelledby="claim-decision-title"
      className={cx(
        'space-y-2 rounded-sm border px-5 py-4',
        approved ? 'border-success/60' : 'border-danger/60',
      )}
    >
      <h2 id="claim-decision-title" className="font-sans text-base font-medium">
        {approved
          ? t('claimDetail.decision.approved', {
              amount: format.money(detail.claim.approvedAmount ?? 0),
            })
          : t('claimDetail.decision.rejected')}
      </h2>
      {entry.comment.trim() && (
        <p className="leading-relaxed break-words text-muted">
          <span className="font-medium text-text">{t('claimDetail.decision.reason')}: </span>
          {entry.comment}
        </p>
      )}
      {detail.claim.status === 'Paid' && (
        <p className="text-sm text-muted">{t('claimDetail.decision.paid')}</p>
      )}
    </section>
  );
}

function Documents({ detail }: { detail: ClaimDetailResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const toast = useToast();
  const invalidate = useInvalidateCabinet();
  const { claim, documents } = detail;
  const queue = useFileQueue({ limit: detail.maxDocuments - documents.length });
  const download = useMutation({
    mutationFn: (document: ClaimDocumentResponse) => downloadClaimDocument(claim.id, document),
  });

  // Added files go up at once: the claim exists, and a file sitting in a list
  // waiting for another button is easy to forget.
  const uploadNow = async () => {
    const { uploaded, failed } = await queue.upload(claim.id);
    if (uploaded.length > 0) {
      toast.toast({
        tone: 'success',
        title: t('claimDetail.documents.uploaded', { count: uploaded.length }),
      });
      queue.clearDone();
      await invalidate();
    }
    return failed;
  };

  return (
    <section aria-labelledby="claim-documents-title" className="space-y-4">
      <h2 id="claim-documents-title" className="text-2xl">
        {t('claimDetail.documents.title')}
      </h2>
      {download.isError && <ErrorNotice error={download.error} />}
      {documents.length === 0 ? (
        <p className="text-muted">{t('claimDetail.documents.empty')}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-4 py-3">
              <span aria-hidden="true" className="text-muted">
                <FileIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={document.fileName}>
                  {document.fileName}
                </p>
                <p className="text-sm text-muted">{format.dateTime(document.uploadedAt)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={download.isPending && download.variables.id === document.id}
                onClick={() => download.mutate(document)}
              >
                <DownloadIcon />
                <span className="sr-only sm:not-sr-only">
                  {t('claimDetail.documents.download')}
                </span>
                <span className="sr-only"> {document.fileName}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {detail.canAddDocuments ? (
        <FileUploader
          queue={queue}
          remaining={detail.maxDocuments - documents.length - queue.items.length}
          label={t('claimDetail.documents.add')}
          disabled={queue.items.some((item) => item.status === 'uploading')}
          onAdded={() => void uploadNow()}
        />
      ) : (
        <p className="text-sm text-muted">
          {claim.status === 'Submitted' || claim.status === 'UnderReview'
            ? t('claimDetail.documents.full', { count: detail.maxDocuments })
            : t('claimDetail.documents.closed')}
        </p>
      )}
    </section>
  );
}
