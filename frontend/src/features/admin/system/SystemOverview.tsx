import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { ErrorSummaryResponse, SystemHealthResponse } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useFormatters } from '../../../i18n/format';
import { todayIso } from '../../../lib/dates';
import { CountUp } from '../../../motion/CountUp';
import { BarChart } from '../dashboard/BarChart';
import type { BarDatum } from '../dashboard/BarChart';
import { ErrorStatusBadge, RegressedBadge, SourceBadge } from './ErrorBadges';
import { useErrorSummary, useSystemHealth } from './queries';
import { ReferenceLookup } from './ReferenceLookup';
import { relativeTime, uptime } from './relativeTime';

// The System section's first screen: the Reference lookup (what an admin
// comes here for), the health tiles, and the error trend and top groups.
export function SystemOverview() {
  const [params] = useSearchParams();

  return (
    <div className="space-y-12">
      {/* The palette's "Find error by Reference" lands here with ?lookup. */}
      <ReferenceLookup focus={params.has('lookup')} />
      <HealthSection />
      <ErrorsSection />
    </div>
  );
}

function HealthSection() {
  const { t } = useTranslation();
  const health = useSystemHealth();
  return (
    <section aria-labelledby="system-health" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="system-health" className="text-xl">
          {t('admin.system.health.title')}
        </h2>
        <p className="text-sm text-muted">{t('admin.system.health.refresh')}</p>
      </div>
      {health.isPending ? (
        <TileGrid>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-2 bg-bg p-5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
          ))}
        </TileGrid>
      ) : health.isError ? (
        <ErrorNotice
          error={health.error}
          title={t('admin.system.health.failed')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void health.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <HealthTiles health={health.data} />
      )}
    </section>
  );
}

function TileGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid stagger gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </dl>
  );
}

function Tile({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: ReactNode;
  tone?: 'success' | 'danger' | 'warning';
  detail?: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1 bg-bg p-5">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd
        className={cx(
          'font-serif text-xl break-words tabular',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </dd>
      {detail && <dd className="text-sm break-words text-muted">{detail}</dd>}
    </div>
  );
}

function HealthTiles({ health }: { health: SystemHealthResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const db = health.database;
  const pending = db.pendingMigrations.length;
  const bakuTime = health.serverTimeBaku.replace('T', ' ').slice(0, 16);
  return (
    <TileGrid>
      <Tile
        label={t('admin.system.health.api')}
        value={t('admin.system.health.running')}
        tone="success"
        detail={
          <>
            {t('admin.system.health.versionBuild', {
              version: health.version,
              build: health.build,
            })}
            <br />
            {t('admin.system.health.environment', { name: health.environment })}
          </>
        }
      />
      <Tile
        label={t('admin.system.health.uptime')}
        value={uptime(health.uptimeSeconds, t)}
        detail={t('admin.system.health.serverTime', { time: bakuTime })}
      />
      <Tile
        label={t('admin.system.health.database')}
        value={t(
          db.reachable ? 'admin.system.health.reachable' : 'admin.system.health.unreachable',
        )}
        tone={db.reachable ? 'success' : 'danger'}
        detail={
          db.roundTripMs !== null
            ? t('admin.system.health.roundTrip', { ms: format.integer(Math.round(db.roundTripMs)) })
            : undefined
        }
      />
      <Tile
        label={t('admin.system.health.migrations')}
        value={
          !db.reachable
            ? t('admin.system.health.unknown')
            : pending === 0
              ? t('admin.system.health.upToDate')
              : t('admin.system.health.pending', { count: pending })
        }
        tone={!db.reachable ? undefined : pending === 0 ? 'success' : 'warning'}
        detail={
          db.lastAppliedMigration
            ? t('admin.system.health.lastMigration', { name: db.lastAppliedMigration })
            : undefined
        }
      />
      <Tile
        label={t('admin.system.health.writer')}
        value={t('admin.system.health.queue', { count: health.queueDepth })}
        tone={health.queueDropped > 0 ? 'warning' : undefined}
        detail={t('admin.system.health.dropped', { count: health.queueDropped })}
      />
      <Tile
        label={t('admin.system.health.errors')}
        value={<CountUp value={health.errorsLast24Hours} format={format.integer} />}
        detail={t('admin.system.health.serverErrors', { count: health.serverErrorsLast24Hours })}
      />
      <Tile
        label={t('admin.system.health.rateLimits')}
        value={<CountUp value={health.rateLimitRejectionsLast24Hours} format={format.integer} />}
        detail={t('admin.system.health.rateLimitsHint')}
      />
      <Tile
        label={t('admin.system.health.audit')}
        value={<CountUp value={health.auditLogSize} format={format.integer} />}
        detail={t('admin.system.health.auditEvents')}
      />
    </TileGrid>
  );
}

function ErrorsSection() {
  const { t } = useTranslation();
  const summary = useErrorSummary();
  return (
    <section aria-labelledby="system-errors" className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="system-errors" className="text-xl">
          {t('admin.system.summary.title')}
        </h2>
        <Link
          to="/app/admin/system/errors"
          className="text-sm font-medium underline decoration-line-strong underline-offset-4 hover:decoration-current"
        >
          {t('admin.system.summary.viewAll')}
        </Link>
      </div>
      {summary.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : summary.isError ? (
        <ErrorNotice
          error={summary.error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <Summary data={summary.data} />
      )}
    </section>
  );
}

function Summary({ data }: { data: ErrorSummaryResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const now = Date.parse(data.generatedAt);
  const pad = (n: number) => String(n).padStart(2, '0');

  const hourly: BarDatum[] = data.lastDay.map((bucket) => {
    const start = new Date(bucket.start);
    const hour = `${pad(start.getHours())}:00`;
    return {
      key: bucket.start,
      label: hour,
      fullLabel: format.dateTime(bucket.start),
      value: bucket.count,
    };
  });
  const daily: BarDatum[] = data.lastWeek.map((bucket) => {
    // The bucket starts at Baku midnight: its Baku date is the day.
    const day = todayIso(new Date(bucket.start));
    return {
      key: bucket.start,
      // "24 Nov" or "24.11": the year is in the full label.
      label: format.date(day).replace(/[\s.]?\d{4}$/, ''),
      fullLabel: format.date(day),
      value: bucket.count,
    };
  });

  return (
    <div className="space-y-10">
      <dl className="grid stagger gap-px border border-line bg-line sm:grid-cols-2">
        <Counter
          label={t('admin.system.summary.unresolved')}
          value={data.unresolved}
          to="/app/admin/system/errors?status=New"
        />
        <Counter
          label={t('admin.system.summary.regressed')}
          value={data.regressed}
          to="/app/admin/system/errors?regressed=true"
          tone={data.regressed > 0 ? 'danger' : undefined}
        />
      </dl>

      <div className="grid gap-10 xl:grid-cols-2">
        <BarChart
          title={t('admin.system.summary.lastDay')}
          data={hourly}
          format={format.integer}
          integer
        />
        <BarChart
          title={t('admin.system.summary.lastWeek')}
          data={daily}
          format={format.integer}
          integer
        />
      </div>

      <section aria-labelledby="system-top" className="space-y-3">
        <h3 id="system-top" className="text-lg">
          {t('admin.system.summary.top')}
        </h3>
        <p className="text-sm text-muted">{t('admin.system.summary.topHint')}</p>
        {data.top.length === 0 ? (
          <p className="text-muted">{t('admin.system.summary.topEmpty')}</p>
        ) : (
          <ol className="stagger divide-y divide-line border-y border-line">
            {data.top.map((group) => (
              <li
                key={group.id}
                className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0 space-y-1">
                  <Link
                    to={`/app/admin/system/errors/${group.id}`}
                    className="font-medium break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
                  >
                    {group.title}
                  </Link>
                  <p className="text-sm break-all text-muted">{group.endpoint}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <SourceBadge source={group.source} />
                  <ErrorStatusBadge status={group.status} />
                  {group.isRegressed && <RegressedBadge />}
                  <span className="text-sm whitespace-nowrap text-muted tabular">
                    {t('admin.system.summary.occurrences', { count: group.occurrenceCount })} ·{' '}
                    {relativeTime(group.lastSeenAt, now, t)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Counter({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: number;
  to: string;
  tone?: 'danger';
}) {
  const format = useFormatters();
  return (
    <div className="bg-bg p-5">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className={cx('font-serif text-2xl tabular', tone === 'danger' && 'text-danger')}>
        <Link to={to} className="focus-ring rounded-sm hover:underline">
          <span className="sr-only">{label}: </span>
          <CountUp value={value} format={format.integer} />
        </Link>
      </dd>
    </div>
  );
}
