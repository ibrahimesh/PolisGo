import { CountUp } from '../../../motion/CountUp';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { AdminDashboardResponse } from '../../../api/types';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { DateField } from '../../../components/ui/DateField';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { cx } from '../../../components/ui/cx';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useFormatters } from '../../../i18n/format';
import { isoToDisplay } from '../../../lib/dateInput';
import { todayIso } from '../../../lib/dates';
import { BarChart } from './BarChart';
import type { BarDatum } from './BarChart';
import {
  isValidCustomRange,
  MAX_RANGE_MONTHS,
  RANGE_PRESETS,
  readRange,
  toDates,
  writeRange,
} from './rangeParams';
import type { RangePreset, RangeState } from './rangeParams';
import { useDashboard } from '../queries';

type RangeChoice = RangePreset | 'custom';

// /app for an Admin: the portfolio over a chosen period. Code-split with the
// rest of the signed-in area, so the landing bundle carries none of it.
export function AdminDashboard() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const range = readRange(params);
  const dates = toDates(range);
  const dashboard = useDashboard(dates);
  const choice: RangeChoice = range.kind === 'custom' ? 'custom' : range.preset;
  const [customOpen, setCustomOpen] = useState(range.kind === 'custom');

  return (
    <div className="space-y-10">
      <PageHeader
        title={t('admin.dashboard.title')}
        description={t('admin.dashboard.lead', {
          from: isoToDisplay(dates.from),
          to: isoToDisplay(dates.to),
        })}
      />

      <section aria-label={t('admin.dashboard.rangeLabel')} className="space-y-4">
        {/* Real radios as wrapping chips: five choices don't fit one row at 390px. */}
        <fieldset>
          <legend className="sr-only">{t('admin.dashboard.rangeLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {[...RANGE_PRESETS, 'custom' as const].map((option) => {
              const checked = (customOpen ? 'custom' : choice) === option;
              return (
                <label
                  key={option}
                  className={cx(
                    'inline-flex min-h-10 cursor-pointer items-center rounded-sm border px-3 text-sm font-medium transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                    checked
                      ? 'border-accent bg-surface-2 text-text'
                      : 'border-line-strong text-muted hover:bg-surface-2 hover:text-text',
                  )}
                >
                  <input
                    type="radio"
                    name="dashboard-range"
                    value={option}
                    checked={checked}
                    onChange={() => {
                      if (option === 'custom') {
                        setCustomOpen(true);
                        return;
                      }
                      setCustomOpen(false);
                      setParams(writeRange({ kind: 'preset', preset: option }), { replace: true });
                    }}
                    className="sr-only"
                  />
                  {t(`admin.dashboard.presets.${option}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
        {customOpen && (
          <CustomRange
            initial={dates}
            onApply={(next) => setParams(writeRange(next), { replace: true })}
          />
        )}
      </section>

      {dashboard.isPending ? (
        <div aria-busy="true" className="space-y-6">
          <span className="sr-only" role="status">
            {t('common.loading')}
          </span>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : dashboard.isError ? (
        <ErrorNotice
          error={dashboard.error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void dashboard.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <div
          aria-busy={dashboard.isFetching}
          className={
            dashboard.isFetching ? 'space-y-12 opacity-60 transition-opacity' : 'space-y-12'
          }
        >
          <Dashboard data={dashboard.data} />
        </div>
      )}
    </div>
  );
}

function CustomRange({
  initial,
  onApply,
}: {
  initial: { from: string; to: string };
  onApply: (range: RangeState) => void;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [error, setError] = useState<string | undefined>();

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!isValidCustomRange(from, to)) {
      setError(
        from > to
          ? 'validation.rangeOrder'
          : from && to
            ? 'validation.rangeTooLong'
            : 'validation.date',
      );
      document.getElementById('dashboard-from')?.focus();
      return;
    }
    setError(undefined);
    onApply({ kind: 'custom', from, to });
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={t('admin.dashboard.customLabel')}
      className="grid items-start gap-4 sm:grid-cols-[repeat(2,minmax(0,16rem))_auto]"
    >
      <DateField
        id="dashboard-from"
        label={t('admin.dashboard.from')}
        value={from}
        onChange={setFrom}
        max={todayIso()}
        hint={t('admin.dashboard.rangeHint', { months: MAX_RANGE_MONTHS })}
        error={error}
      />
      <DateField
        id="dashboard-to"
        label={t('admin.dashboard.to')}
        value={to}
        onChange={setTo}
        max={todayIso()}
      />
      <Button type="submit" variant="secondary" className="sm:mt-7">
        {t('admin.dashboard.apply')}
      </Button>
    </form>
  );
}

function Dashboard({ data }: { data: AdminDashboardResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const months = t('dateField.months', { returnObjects: true }) as string[];
  const series = (pick: (m: AdminDashboardResponse['monthly'][number]) => number): BarDatum[] =>
    data.monthly.map((m) => ({
      key: `${m.year}-${m.month}`,
      label: (months[m.month - 1] ?? '').slice(0, 3),
      fullLabel: `${months[m.month - 1] ?? ''} ${m.year}`,
      value: pick(m),
    }));
  const hours = data.totals.averageResolutionHours;
  const resolution =
    hours === null
      ? '—'
      : hours >= 48
        ? t('admin.dashboard.days', { value: format.factorPlain(hours / 24) })
        : t('admin.dashboard.hours', { value: format.factorPlain(hours) });

  const tiles = [
    {
      id: 'policies',
      value: <CountUp value={data.totals.policiesIssued} format={format.integer} />,
    },
    {
      id: 'premium',
      value: <CountUp value={data.totals.premiumWritten} format={(n) => format.money(n)} />,
    },
    { id: 'claims', value: <CountUp value={data.totals.claimsFiled} format={format.integer} /> },
    {
      id: 'decided',
      value: <CountUp value={data.totals.claimsDecided} format={format.integer} />,
    },
    { id: 'resolution', value: resolution },
    {
      id: 'paid',
      value: <CountUp value={data.totals.claimsPaidAmount} format={(n) => format.money(n)} />,
    },
  ];

  return (
    <>
      <section aria-labelledby="dashboard-totals">
        <h2 id="dashboard-totals" className="sr-only">
          {t('admin.dashboard.totals')}
        </h2>
        <dl className="grid stagger gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.id} className="space-y-1 bg-bg p-5">
              <dt className="text-sm font-medium text-muted">
                {t(`admin.dashboard.tiles.${tile.id}`)}
              </dt>
              <dd className="font-serif text-2xl tabular">{tile.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="dashboard-trends" className="space-y-8">
        <h2 id="dashboard-trends" className="text-2xl">
          {t('admin.dashboard.trends')}
        </h2>
        <div className="grid gap-10 xl:grid-cols-2">
          <BarChart
            title={t('admin.dashboard.charts.premium')}
            data={series((m) => m.premiumWritten)}
            format={(v) => format.money(v)}
            axisFormat={(v) => format.integer(v)}
          />
          <BarChart
            title={t('admin.dashboard.charts.policies')}
            data={series((m) => m.policiesIssued)}
            format={(v) => format.integer(v)}
            integer
          />
          <BarChart
            title={t('admin.dashboard.charts.claims')}
            data={series((m) => m.claimsFiled)}
            format={(v) => format.integer(v)}
            integer
          />
          <ClaimsByStatus data={data} />
        </div>
      </section>

      <TopAgents data={data} />
    </>
  );
}

// Few categories with their numbers written out: bars in text rows read
// better than a chart and need no other text alternative.
function ClaimsByStatus({ data }: { data: AdminDashboardResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const max = Math.max(1, ...data.claimsByStatus.map((s) => s.count));
  return (
    <figure className="space-y-3">
      <figcaption className="font-sans text-base font-medium">
        {t('admin.dashboard.charts.byStatus')}
      </figcaption>
      <dl className="space-y-3">
        {data.claimsByStatus.map((entry) => (
          <div
            key={entry.status}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3"
          >
            <dt className="truncate text-sm">{t(`claimStatus.${entry.status}`)}</dt>
            <dd aria-hidden="true" className="h-3">
              <span
                className="block h-full rounded-r-sm bg-accent"
                style={{ width: `${(entry.count / max) * 100}%` }}
              />
            </dd>
            <dd className="text-right text-sm tabular">{format.integer(entry.count)}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

function TopAgents({ data }: { data: AdminDashboardResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const max = Math.max(1, ...data.topAgents.map((a) => a.premiumWritten));
  return (
    <section aria-labelledby="dashboard-agents" className="space-y-4">
      <h2 id="dashboard-agents" className="text-2xl">
        {t('admin.dashboard.topAgents')}
      </h2>
      {data.topAgents.length === 0 ? (
        <p className="text-muted">{t('admin.dashboard.noAgents')}</p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {data.topAgents.map((agent, index) => (
            <li
              key={agent.agentId}
              className="grid gap-2 py-4 sm:grid-cols-[2rem_minmax(0,16rem)_1fr_auto] sm:items-center sm:gap-4"
            >
              <span className="text-sm text-muted tabular">{index + 1}</span>
              <span className="min-w-0">
                <Link
                  to={`/app/customers?agent=${agent.agentId}`}
                  className="font-medium break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
                >
                  {agent.fullName}
                </Link>
                {!agent.isActive && (
                  <span className="block text-sm text-muted">{t('admin.staff.inactive')}</span>
                )}
              </span>
              <span aria-hidden="true" className="h-3">
                <span
                  className="block h-full rounded-r-sm bg-accent"
                  style={{ width: `${(agent.premiumWritten / max) * 100}%` }}
                />
              </span>
              <span className="text-sm tabular sm:text-right">
                {t('admin.dashboard.agentFigures', {
                  premium: format.money(agent.premiumWritten),
                  count: agent.policiesSold,
                })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
