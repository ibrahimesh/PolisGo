import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ActivityEntry, ClientOverviewResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { AlertIcon, ArrowRightIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFormatters } from '../../i18n/format';
import { todayIso } from '../../lib/dates';
import { firstName } from '../../lib/names';
import { useOverview, useReminders } from '../cabinet/queries';
import { ReminderList } from '../reminders/ReminderList';

export function ClientOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const format = useFormatters();
  const overview = useOverview();

  return (
    <div className="space-y-10">
      <PageHeader
        title={t('overview.titleLead')}
        accent={user ? firstName(user.fullName) : undefined}
        description={t('overview.lead', { date: format.date(todayIso()) })}
        actions={
          <>
            <ButtonLink to="/#calculator" variant="secondary">
              {t('overview.getQuote')}
            </ButtonLink>
            <ButtonLink to="/app/buy">{t('overview.buy')}</ButtonLink>
          </>
        }
      />

      {overview.isPending ? (
        <OverviewSkeleton />
      ) : overview.isError ? (
        <ErrorNotice
          error={overview.error}
          title={t('overview.error')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void overview.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : isEmpty(overview.data) ? (
        <EmptyState
          title={t('overview.empty.title')}
          body={t('overview.empty.body')}
          action={<ButtonLink to="/app/buy">{t('overview.empty.action')}</ButtonLink>}
        />
      ) : (
        <OverviewContent data={overview.data} />
      )}
    </div>
  );
}

function isEmpty(data: ClientOverviewResponse) {
  return (
    data.activePolicies === 0 && data.awaitingPayment === 0 && data.recentActivity.length === 0
  );
}

function OverviewContent({ data }: { data: ClientOverviewResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const next = data.nextRenewal;

  return (
    <>
      {(data.unreadReminders > 0 || data.awaitingPayment > 0 || data.unreadClaimUpdates > 0) && (
        <div className="space-y-3">
          {data.unreadClaimUpdates > 0 && (
            <Notice
              text={t('overview.notices.claimUpdates', { count: data.unreadClaimUpdates })}
              to="/app/claims"
              action={t('overview.notices.claims')}
            />
          )}
          {data.unreadReminders > 0 && (
            <Notice
              text={t('overview.notices.reminders', { count: data.unreadReminders })}
              to="#reminders"
              action={t('overview.notices.review')}
            />
          )}
          {data.awaitingPayment > 0 && (
            <Notice
              text={t('overview.notices.awaiting', { count: data.awaitingPayment })}
              to="/app/policies?status=Draft"
              action={t('overview.notices.pay')}
            />
          )}
        </div>
      )}

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" className="sr-only">
          {t('overview.stats.label')}
        </h2>
        {/* 1px gaps over the line colour draw the hairlines between cells at any column count. */}
        <dl className="grid grid-cols-1 gap-px rounded-sm border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label={t('overview.stats.active')}
            value={format.integer(data.activePolicies)}
            hint={
              data.awaitingPayment > 0
                ? t('overview.stats.awaiting', { count: data.awaitingPayment })
                : t('overview.stats.awaitingNone')
            }
          />
          <Stat
            label={t('overview.stats.nextRenewal')}
            value={next ? format.date(next.endDate) : '—'}
            hint={
              next ? (
                <Link
                  to={`/app/policies/${next.policyId}`}
                  className="underline decoration-line-strong underline-offset-4 hover:decoration-current"
                >
                  {next.daysLeft === 0
                    ? t('overview.stats.endsToday')
                    : t('overview.stats.inDays', { count: next.daysLeft })}
                  <span className="sr-only"> — {next.policyNumber}</span>
                </Link>
              ) : (
                t('overview.stats.noRenewal')
              )
            }
          />
          <Stat
            label={t('overview.stats.insured')}
            value={t('overview.stats.insuredValue', {
              insured: format.integer(data.insuredVehicles),
              total: format.integer(data.vehicles),
            })}
            hint={t('overview.stats.insuredHint')}
          />
          <Stat
            label={t('overview.stats.paid')}
            value={format.money(data.paidLast12Months, data.currency)}
            hint={t('overview.stats.paidHint')}
          />
        </dl>
      </section>

      <div className="grid gap-10 xl:grid-cols-12">
        <section aria-labelledby="activity-title" className="space-y-4 xl:col-span-7">
          <h2 id="activity-title" className="text-xl">
            {t('overview.activity.title')}
          </h2>
          {data.recentActivity.length === 0 ? (
            <p className="text-muted">{t('overview.activity.empty')}</p>
          ) : (
            <ol className="divide-y divide-line border-y border-line">
              {data.recentActivity.map((entry) => (
                <ActivityItem key={`${entry.kind}-${entry.subjectId}-${entry.at}`} entry={entry} />
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-10 xl:col-span-5">
          <ClaimsSection data={data} />
          <RemindersSection />
        </div>
      </div>
    </>
  );
}

function ClaimsSection({ data }: { data: ClientOverviewResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const latest = data.latestClaimUpdate;
  return (
    <section aria-labelledby="claims-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="claims-title" className="text-xl">
          {t('overview.claims.title')}
        </h2>
        <p className="text-sm text-muted">
          {data.openClaims > 0
            ? t('overview.claims.open', { count: data.openClaims })
            : t('overview.claims.noneOpen')}
        </p>
      </div>
      <div className="border-y border-line py-4">
        {latest ? (
          <p>
            <span className="block text-sm text-muted">{t('overview.claims.latest')}</span>
            <Link
              to={`/app/claims/${latest.claimId}`}
              className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-current"
            >
              {t(`overview.activity.claim.${latest.toStatus}`, { ref: latest.claimNumber })}
            </Link>
            <span className="block text-sm text-muted tabular">{format.dateTime(latest.at)}</span>
          </p>
        ) : (
          <p className="text-muted">{t('overview.claims.none')}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to="/app/claims/new" variant="secondary" size="sm">
          {t('claims.file')}
        </ButtonLink>
        <ButtonLink to="/app/claims" variant="ghost" size="sm">
          {t('overview.claims.all')}
        </ButtonLink>
      </div>
    </section>
  );
}

function RemindersSection() {
  const { t } = useTranslation();
  const reminders = useReminders();

  return (
    <section id="reminders" aria-labelledby="reminders-title" className="scroll-mt-24 space-y-4">
      <div className="space-y-1">
        <h2 id="reminders-title" className="text-xl">
          {t('reminders.title')}
        </h2>
        <p className="text-sm text-muted">{t('reminders.lead')}</p>
      </div>
      {reminders.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : reminders.isError ? (
        <ErrorNotice error={reminders.error} />
      ) : reminders.data.length === 0 ? (
        <p className="border-y border-line py-4 text-muted">{t('reminders.empty')}</p>
      ) : (
        <ReminderList reminders={reminders.data} />
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint: ReactNode }) {
  return (
    <div className="space-y-2 bg-bg p-6">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="font-serif text-xl tabular sm:text-2xl">{value}</dd>
      <dd className="text-sm text-muted">{hint}</dd>
    </div>
  );
}

function Notice({ text, to, action }: { text: string; to: string; action: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-warning/50 px-4 py-3">
      <span className="text-warning">
        <AlertIcon />
      </span>
      <p className="min-w-0 flex-1">{text}</p>
      <Link
        to={to}
        className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        {action}
        <ArrowRightIcon />
      </Link>
    </div>
  );
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const key = `overview.activity.${entry.kind === 'Policy' ? 'policy' : 'claim'}.${entry.toStatus}`;
  const text = t(key, { ref: entry.reference, defaultValue: entry.reference });

  return (
    <li className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6">
      <time dateTime={entry.at} className="shrink-0 text-sm text-muted tabular sm:w-40">
        {format.dateTime(entry.at)}
      </time>
      {entry.kind === 'Policy' ? (
        <Link
          to={`/app/policies/${entry.subjectId}`}
          className="min-w-0 break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
        >
          {text}
        </Link>
      ) : (
        <span className="min-w-0 break-words">{text}</span>
      )}
    </li>
  );
}

// Mirrors the loaded layout (notice-free): stats row, then two columns.
function OverviewSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="space-y-10">
      <span className="sr-only" role="status">
        {t('common.loading')}
      </span>
      <div className="grid grid-cols-1 gap-6 border-y border-line py-6 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </div>
      <div className="grid gap-10 xl:grid-cols-12">
        <Skeleton className="h-48 w-full xl:col-span-7" />
        <Skeleton className="h-48 w-full xl:col-span-5" />
      </div>
    </div>
  );
}
