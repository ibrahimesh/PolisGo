import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { isApiError } from '../../api/errors';
import type { PolicyDetailResponse } from '../../api/types';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { AlertIcon, ArrowLeftIcon, CheckIcon, DashIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { Caption, Table, TBody, Td, TFoot, Th, THead, Tr } from '../../components/ui/Table';
import { useFormatters } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { usePolicy } from '../cabinet/queries';
import { CertificateButton } from '../certificate/CertificateButton';
import { canDownloadCertificate } from '../certificate/rules';
import { COVERAGE_BY_CODE, COVERAGE_ROWS } from '../landing/coverage';
import { termMonths } from './policyDates';
import { PolicyStatusBadge } from './PolicyStatusBadge';
import { useProductName } from './useProductName';

const FACTORS = [
  'engineFactor',
  'driverAgeFactor',
  'experienceFactor',
  'vehicleAgeFactor',
  'bonusMalusFactor',
  'termFactor',
] as const;

export function PolicyDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const policy = usePolicy(id);

  const back = (
    <Link
      to="/app/policies"
      className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <ArrowLeftIcon />
      {t('policy.back')}
    </Link>
  );

  if (policy.isPending) return <DetailSkeleton back={back} />;

  if (policy.isError) {
    // Someone else's policy and a missing one answer the same 404.
    if (isApiError(policy.error) && policy.error.status === 404) {
      return (
        <div className="space-y-4">
          {back}
          <EmptyState
            headingLevel="h1"
            title={t('policy.notFoundTitle')}
            body={t('policy.notFoundBody')}
            action={
              <ButtonLink to="/app/policies" variant="secondary">
                {t('policy.back')}
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
          error={policy.error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void policy.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return <Detail detail={policy.data} back={back} />;
}

function Detail({ detail, back }: { detail: PolicyDetailResponse; back: ReactNode }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const { policy, vehicle } = detail;
  const payable = policy.status === 'Draft' && policy.startDate >= todayIso();
  const certificate = canDownloadCertificate(detail);

  return (
    <div className="space-y-10">
      <PageHeader
        before={back}
        title={product.name(policy.policyTypeCode)}
        description={product.hint(policy.policyTypeCode) || undefined}
        actions={
          <>
            {payable && (
              <ButtonLink to={`/app/buy?draft=${policy.id}`}>{t('policy.payNow')}</ButtonLink>
            )}
            {certificate && (
              <CertificateButton detail={detail} variant={payable ? 'secondary' : 'primary'} />
            )}
          </>
        }
      />

      {policy.status === 'Draft' && (
        <p className="flex items-start gap-3 rounded-sm border border-warning/50 px-4 py-3">
          <span className="mt-0.5 text-warning">
            <AlertIcon />
          </span>
          {payable ? t('certificate.unavailable') : t('policy.draftExpired')}
        </p>
      )}
      {policy.status === 'Cancelled' && certificate && (
        <p className="text-sm text-muted">{t('certificate.cancelledNote')}</p>
      )}

      <div className="grid gap-10 xl:grid-cols-12">
        {/* The data card: the brightest object on the page, so the facts read first. */}
        <Card
          variant="paper"
          as="section"
          aria-labelledby="summary-title"
          className="h-fit p-6 sm:p-8 xl:col-span-5"
        >
          <h2 id="summary-title" className="sr-only">
            {t('policy.summary')}
          </h2>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-paper-muted">{t('policy.number')}</p>
              <p className="font-serif text-xl break-all tabular">{policy.policyNumber}</p>
            </div>
            <PolicyStatusBadge status={policy.status} onPaper />
          </div>
          <p className="mt-6 text-sm font-medium text-paper-muted">{t('policy.premium')}</p>
          <p className="font-serif text-2xl tabular">
            {format.money(policy.premium, policy.currency)}
          </p>
          <dl className="mt-6 divide-y divide-paper-line border-t border-paper-line">
            <Fact label={t('policy.period')}>
              {t('policy.periodValue', {
                from: format.date(policy.startDate),
                to: format.date(policy.endDate),
              })}
            </Fact>
            <Fact label={t('policy.term')}>
              {t('calculator.termOption', {
                count: termMonths(policy.startDate, policy.endDate),
              })}
            </Fact>
            <Fact label={t('policy.vehicle')}>
              {vehicle.plateNumber} · {vehicle.make} {vehicle.model}, {vehicle.year}
            </Fact>
            <Fact label={t('certificate.vin')}>{vehicle.vin}</Fact>
            <Fact label={t('certificate.holder')}>{detail.holderName}</Fact>
            <Fact label={t('policy.issued')}>{format.dateTime(policy.createdAt)}</Fact>
          </dl>
        </Card>

        <div className="space-y-12 xl:col-span-7">
          <Coverage code={policy.policyTypeCode} />
          <Breakdown detail={detail} />
          <Payment detail={detail} />
          <History detail={detail} />
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-paper-muted">{label}</dt>
      <dd className="break-words tabular">{children}</dd>
    </div>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-xl">
      {children}
    </h2>
  );
}

function Coverage({ code }: { code: string }) {
  const { t } = useTranslation();
  const covers: readonly string[] = COVERAGE_BY_CODE[code]?.covers ?? [];
  return (
    <section aria-labelledby="coverage-title" className="space-y-4">
      <SectionTitle id="coverage-title">{t('policy.coverage')}</SectionTitle>
      <ul className="divide-y divide-line border-y border-line">
        {COVERAGE_ROWS.map((row) => {
          const included = covers.includes(row);
          return (
            <li key={row} className="flex items-start justify-between gap-4 py-3">
              <span className={cx('min-w-0', !included && 'text-muted')}>
                {t(`landing.coverage.rows.${row}`)}
              </span>
              <span
                className={cx(
                  'flex shrink-0 items-center gap-2 text-sm',
                  included ? 'text-success' : 'text-muted',
                )}
              >
                {included ? <CheckIcon /> : <DashIcon />}
                {included ? t('policy.included') : t('policy.notIncluded')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Breakdown({ detail }: { detail: PolicyDetailResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const pricing = detail.pricing;
  return (
    <section aria-labelledby="breakdown-title" className="space-y-4">
      <div className="space-y-1">
        <SectionTitle id="breakdown-title">{t('policy.breakdown')}</SectionTitle>
        <p className="text-sm text-muted">
          {pricing ? t('policy.breakdownLead') : t('policy.breakdownMissing')}
        </p>
      </div>
      {pricing && (
        <Table>
          <Caption>{t('policy.breakdown')}</Caption>
          <THead>
            <Tr>
              <Th>{t('calculator.table.factor')}</Th>
              <Th className="text-right">{t('calculator.table.value')}</Th>
            </Tr>
          </THead>
          <TBody>
            <Tr>
              <Th scope="row">{t('calculator.factor.baseRate')}</Th>
              <Td className="text-right">{format.money(pricing.baseRate, pricing.currency)}</Td>
            </Tr>
            {FACTORS.map((key) => (
              <Tr key={key}>
                <Th scope="row">{t(`calculator.factor.${key}`)}</Th>
                <Td className="text-right">{format.factor(pricing[key])}</Td>
              </Tr>
            ))}
          </TBody>
          <TFoot>
            <Tr className="border-t border-line-strong">
              <Th scope="row" className="font-medium">
                {t('calculator.factor.premium')}
              </Th>
              <Td className="text-right font-serif text-lg">
                {format.money(pricing.premium, pricing.currency)}
              </Td>
            </Tr>
          </TFoot>
        </Table>
      )}
    </section>
  );
}

function Payment({ detail }: { detail: PolicyDetailResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  return (
    <section aria-labelledby="payment-title" className="space-y-4">
      <SectionTitle id="payment-title">{t('policy.payment')}</SectionTitle>
      {detail.payments.length === 0 ? (
        <p className="border-y border-line py-3 text-muted">{t('policy.notPaid')}</p>
      ) : (
        detail.payments.map((payment) => (
          <dl
            key={payment.id}
            className="grid gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-2"
          >
            <div>
              <dt className="text-sm font-medium text-muted">{t('policy.amount')}</dt>
              <dd className="tabular">{format.money(payment.amount, payment.currency)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">{t('policy.paidAt')}</dt>
              <dd className="tabular">{format.dateTime(payment.paidAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted">{t('policy.method')}</dt>
              <dd>{t(`policy.methods.${payment.method}`)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm font-medium text-muted">{t('policy.reference')}</dt>
              <dd className="break-all tabular">{payment.reference ?? '—'}</dd>
            </div>
          </dl>
        ))
      )}
    </section>
  );
}

function History({ detail }: { detail: PolicyDetailResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  return (
    <section aria-labelledby="history-title" className="space-y-4">
      <SectionTitle id="history-title">{t('policy.history')}</SectionTitle>
      <ol className="space-y-0 border-l border-line">
        {detail.history.map((entry) => (
          <li key={`${entry.toStatus}-${entry.changedAt}`} className="relative pb-6 pl-6 last:pb-0">
            <span
              aria-hidden="true"
              className="absolute top-2 -left-[5px] size-2.5 rounded-full border border-line-strong bg-bg"
            />
            <div className="flex flex-wrap items-center gap-3">
              <PolicyStatusBadge status={entry.toStatus} />
              <time dateTime={entry.changedAt} className="text-sm text-muted tabular">
                {entry.automatic ? format.date(entry.changedAt) : format.dateTime(entry.changedAt)}
              </time>
            </div>
            {(entry.fromStatus === null || entry.automatic) && (
              <p className="mt-1 text-sm text-muted">
                {entry.automatic ? t('policy.historyAutomatic') : t('policy.historyIssued')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DetailSkeleton({ back }: { back: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="space-y-10">
      <span className="sr-only" role="status">
        {t('common.loading')}
      </span>
      <div className="space-y-4 border-b border-line pb-8">
        {back}
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid gap-10 xl:grid-cols-12">
        <Skeleton className="h-96 w-full xl:col-span-5" />
        <div className="space-y-6 xl:col-span-7">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
