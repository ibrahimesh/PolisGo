import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { errorsApi } from '../../../api/endpoints';
import { ERROR_SORTS, ERROR_SOURCES, ERROR_STATUSES } from '../../../api/types';
import type { ErrorGroupRow, ErrorSort, ErrorSource, ErrorStatus } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Pagination } from '../../../components/ui/Pagination';
import { SearchField } from '../../../components/ui/SearchField';
import { Select } from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/ToastProvider';
import { useFormatters } from '../../../i18n/format';
import { useExclusive, useNow } from '../../../lib/hooks';
import { useInvalidateCabinet } from '../../cabinet/queries';
import { ListSkeleton } from '../../staff/ListSkeleton';
import { ErrorStatusBadge, RegressedBadge, SourceBadge } from './ErrorBadges';
import {
  DEFAULT_ERRORS,
  ERRORS_PAGE_SIZE,
  ERRORS_SEARCH_MAX,
  hasErrorFilters,
  readErrors,
  toErrorQuery,
  writeErrors,
} from './errorParams';
import type { ErrorsState } from './errorParams';
import { useErrorGroups } from './queries';
import { relativeTime } from './relativeTime';

// Every error group, newest first by default. Filters live in the URL (as in
// the audit log); the search takes a Reference as it was quoted. Rows can be
// resolved or ignored together; each change carries the row's version.
export function ErrorsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readErrors(params);
  const errors = useErrorGroups(toErrorQuery(state));
  const [typing, setTyping] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const data = errors.data;
  const settled = Boolean(data) && !errors.isPlaceholderData && !typing;
  const filtered = hasErrorFilters(state);
  const pages = data
    ? Math.max(1, Math.ceil(Math.min(data.totalCount, 200 * ERRORS_PAGE_SIZE) / ERRORS_PAGE_SIZE))
    : 1;

  // As in the audit log: build each change on the last URL written, not on
  // this render's (React Router's functional update hands over stale params).
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);
  const write = (next: ErrorsState, replace: boolean) => {
    const search = writeErrors(next);
    latest.current = search;
    setSelected(new Set());
    setParams(search, { replace });
  };
  const update = (patch: Partial<ErrorsState>) =>
    write({ ...readErrors(latest.current), page: 1, ...patch }, true);

  const rows = data?.items ?? [];
  const visibleSelected = rows.filter((row) => selected.has(row.id));

  return (
    <div className="space-y-8">
      <form
        role="search"
        aria-label={t('admin.system.list.caption')}
        onSubmit={(event) => event.preventDefault()}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <div className="md:col-span-2 xl:col-span-4">
          <SearchField
            id="errors-search"
            label={t('admin.system.list.search')}
            hint={t('admin.system.list.searchHint')}
            placeholder={t('admin.system.list.searchPlaceholder')}
            clearLabel={t('admin.system.list.clearSearch')}
            value={state.q}
            maxLength={ERRORS_SEARCH_MAX}
            onCommit={(q) => update({ q })}
            onTyping={setTyping}
          />
        </div>
        <Select
          label={t('admin.system.list.source')}
          value={state.source}
          onChange={(event) => update({ source: event.target.value as ErrorSource | '' })}
          options={[
            { value: '', label: t('admin.system.list.anySource') },
            ...ERROR_SOURCES.map((s) => ({ value: s, label: t(`admin.system.sources.${s}`) })),
          ]}
        />
        <Select
          label={t('admin.system.list.status')}
          value={state.status}
          onChange={(event) => update({ status: event.target.value as ErrorStatus | '' })}
          options={[
            { value: '', label: t('admin.system.list.anyStatus') },
            ...ERROR_STATUSES.map((s) => ({ value: s, label: t(`admin.system.statuses.${s}`) })),
          ]}
        />
        <Select
          label={t('admin.system.list.sort')}
          value={state.sort}
          onChange={(event) => update({ sort: event.target.value as ErrorSort })}
          options={ERROR_SORTS.map((s) => ({ value: s, label: t(`admin.system.list.sorts.${s}`) }))}
        />
        <label className="flex min-h-12 items-center gap-3 self-end text-base">
          <input
            type="checkbox"
            checked={state.regressed}
            onChange={(event) => update({ regressed: event.target.checked })}
            className="size-5 accent-accent"
          />
          {t('admin.system.list.regressedOnly')}
        </label>
      </form>

      <section aria-labelledby="errors-results" className="space-y-4">
        <h2 id="errors-results" className="sr-only">
          {t('admin.system.list.caption')}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-muted" data-testid="errors-count">
            {!data
              ? ' '
              : !settled
                ? t('admin.system.list.searching')
                : t('admin.system.list.count', { count: data.totalCount })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {filtered && (
              <Button variant="ghost" size="sm" onClick={() => write(DEFAULT_ERRORS, true)}>
                {t('policies.clearFilters')}
              </Button>
            )}
            <PurgeButton />
          </div>
        </div>

        {visibleSelected.length > 0 && (
          <BulkBar rows={visibleSelected} onDone={() => setSelected(new Set())} />
        )}

        {errors.isPending ? (
          <ListSkeleton />
        ) : errors.isError ? (
          <ErrorNotice
            error={errors.error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void errors.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : errors.data.totalCount === 0 && settled ? (
          <EmptyState
            headingLevel="h3"
            title={
              filtered ? t('admin.system.list.noMatchTitle') : t('admin.system.list.emptyTitle')
            }
            body={filtered ? t('admin.system.list.noMatchBody') : t('admin.system.list.emptyBody')}
          />
        ) : (
          <ErrorRows
            rows={rows}
            busy={!settled}
            selected={selected}
            onToggle={(id, on) =>
              setSelected((current) => {
                const next = new Set(current);
                if (on) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            onToggleAll={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())}
          />
        )}

        {data && data.totalCount > 0 && pages > 1 && (
          <Pagination
            page={Math.min(state.page, pages)}
            pages={pages}
            label={t('admin.system.list.pagination')}
            onChange={(page) => write({ ...readErrors(latest.current), page }, false)}
          />
        )}
      </section>
    </div>
  );
}

// A table from md up; below it, the same rows as stacked blocks, so a phone
// never scrolls sideways. Only one of the two is displayed (and exposed).
function ErrorRows({
  rows,
  busy,
  selected,
  onToggle,
  onToggleAll,
}: {
  rows: readonly ErrorGroupRow[];
  busy: boolean;
  selected: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const now = useNow();
  const all = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const checkbox = (row: ErrorGroupRow) => (
    <input
      type="checkbox"
      checked={selected.has(row.id)}
      onChange={(event) => onToggle(row.id, event.target.checked)}
      aria-label={t('admin.system.list.select', { title: row.title })}
      className="size-5 accent-accent"
    />
  );
  const title = (row: ErrorGroupRow) => (
    <Link
      to={`/app/admin/system/errors/${row.id}`}
      className="font-medium break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
    >
      {row.title}
    </Link>
  );
  const seen = (row: ErrorGroupRow) => (
    <>
      <span className="block">{relativeTime(row.lastSeenAt, now, t)}</span>
      <time dateTime={row.lastSeenAt} className="block text-sm text-muted">
        {format.dateTime(row.lastSeenAt)}
      </time>
    </>
  );
  const status = (row: ErrorGroupRow) => (
    <span className="flex flex-wrap gap-2">
      <ErrorStatusBadge status={row.status} />
      {row.isRegressed && <RegressedBadge />}
    </span>
  );

  return (
    <div
      aria-busy={busy}
      className={cx('transition-opacity duration-(--duration-fast)', busy && 'opacity-60')}
    >
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left tabular">
          <caption className="sr-only">{t('admin.system.list.caption')}</caption>
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th scope="col" className="w-10 py-3 pr-2 font-medium">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={(event) => onToggleAll(event.target.checked)}
                  aria-label={t('admin.system.list.selectAll')}
                  className="size-5 accent-accent"
                />
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                {t('admin.system.list.columns.title')}
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                {t('admin.system.list.columns.source')}
              </th>
              <th scope="col" className="py-3 pr-4 text-right font-medium">
                {t('admin.system.list.columns.count')}
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                {t('admin.system.list.columns.lastSeen')}
              </th>
              <th scope="col" className="py-3 font-medium">
                {t('admin.system.list.columns.status')}
              </th>
            </tr>
          </thead>
          <tbody className="stagger">
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                <td className="py-4 pr-2">{checkbox(row)}</td>
                <td className="max-w-md py-4 pr-4">
                  {title(row)}
                  <span className="mt-1 block text-sm break-all text-muted">{row.endpoint}</span>
                </td>
                <td className="py-4 pr-4">
                  <SourceBadge source={row.source} />
                </td>
                <td className="py-4 pr-4 text-right">{format.integer(row.occurrenceCount)}</td>
                <td className="py-4 pr-4 whitespace-nowrap">{seen(row)}</td>
                <td className="py-4">{status(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="stagger divide-y divide-line border-y border-line md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex gap-3 py-4">
            <div className="pt-0.5">{checkbox(row)}</div>
            <div className="min-w-0 flex-1 space-y-2">
              {title(row)}
              <p className="text-sm break-all text-muted">{row.endpoint}</p>
              <div className="flex flex-wrap items-center gap-2">
                <SourceBadge source={row.source} />
                {status(row)}
              </div>
              <p className="text-sm text-muted tabular">
                {t('admin.system.summary.occurrences', { count: row.occurrenceCount })} ·{' '}
                {relativeTime(row.lastSeenAt, now, t)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Resolve or ignore the selected rows, one request each with its own
// version: a row someone else changed meanwhile is skipped, not overwritten.
function BulkBar({ rows, onDone }: { rows: readonly ErrorGroupRow[]; onDone: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const invalidate = useInvalidateCabinet();
  const exclusive = useExclusive();
  const [busy, setBusy] = useState(false);

  const apply = (status: ErrorStatus) =>
    exclusive(async () => {
      setBusy(true);
      const results = await Promise.allSettled(
        rows
          .filter((row) => row.status !== status)
          .map((row) => errorsApi.updateStatus(row.id, { status, rowVersion: row.rowVersion })),
      );
      const done = results.filter((r) => r.status === 'fulfilled').length;
      const skipped = rows.length - done;
      setBusy(false);
      onDone();
      void invalidate();
      toast({
        tone: skipped > 0 ? 'error' : 'success',
        title: t('admin.system.list.bulkDone', { count: done }),
        ...(skipped > 0
          ? { description: t('admin.system.list.bulkSkipped', { count: skipped }) }
          : {}),
      });
    });

  return (
    <div
      role="region"
      aria-label={t('admin.system.list.selected', { count: rows.length })}
      className="flex animate-pop-in flex-wrap items-center gap-3 rounded-sm border border-line-strong bg-surface px-4 py-3"
    >
      <p className="mr-auto text-sm font-medium" aria-live="polite">
        {t('admin.system.list.selected', { count: rows.length })}
      </p>
      <Button size="sm" variant="secondary" loading={busy} onClick={() => void apply('Resolved')}>
        {t('admin.system.list.resolveSelected')}
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void apply('Ignored')}>
        {t('admin.system.list.ignoreSelected')}
      </Button>
    </div>
  );
}

function PurgeButton() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const invalidate = useInvalidateCabinet();
  const exclusive = useExclusive();
  const daysId = useId();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('30');
  const [error, setError] = useState<unknown>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = () =>
    exclusive(async () => {
      const value = Number(days);
      if (!Number.isInteger(value) || value < 1 || value > 3650) {
        setInvalid(true);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await errorsApi.purgeResolved(value);
        setOpen(false);
        void invalidate();
        toast({ tone: 'success', title: t('admin.system.purge.done', { count: result.deleted }) });
      } catch (caught) {
        setError(caught);
      } finally {
        setBusy(false);
      }
    });

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t('admin.system.purge.open')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('admin.system.purge.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('admin.system.purge.cancel')}
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              {t('admin.system.purge.confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p>{t('admin.system.purge.body')}</p>
          <Input
            id={daysId}
            label={t('admin.system.purge.days')}
            inputMode="numeric"
            value={days}
            error={invalid ? 'admin.system.purge.daysInvalid' : undefined}
            onChange={(event) => {
              setDays(event.target.value.replace(/\D/g, '').slice(0, 4));
              setInvalid(false);
            }}
            className="max-w-40"
          />
          {error !== null && <ErrorNotice error={error} />}
        </div>
      </Modal>
    </>
  );
}
