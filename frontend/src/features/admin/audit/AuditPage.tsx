import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { AUDIT_ENTITY_TYPES } from '../../../api/types';
import type { AuditEntityType, AuditEventResponse } from '../../../api/types';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { DateFilterField } from '../../../components/ui/DateFilterField';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { CloseIcon, SearchIcon } from '../../../components/ui/icons';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { useFormatters } from '../../../i18n/format';
import { todayIso } from '../../../lib/dates';
import { ListSkeleton } from '../../staff/ListSkeleton';
import { useAudit } from '../queries';
import { ActorCombobox } from './ActorCombobox';
import {
  AUDIT_PAGE_SIZE,
  AUDIT_SEARCH_MAX,
  DEFAULT_AUDIT,
  hasAuditFilters,
  readAudit,
  toAuditQuery,
  writeAudit,
} from './auditParams';
import type { AuditState } from './auditParams';
import { matchAuditCodes } from './auditSearch';

// Everything recorded, newest first: claim and policy status changes and the
// staff actions logged since the admin panel shipped. Nothing is inferred.
export function AuditPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readAudit(params);
  const audit = useAudit(toAuditQuery(state, matchAuditCodes(state.q, t)));
  // Typed but not yet sent (the 300ms debounce).
  const [typing, setTyping] = useState(false);
  const data = audit.data;
  // keepPreviousData shows the last result while the next one loads. Its
  // count belongs to the previous filters, so it is never shown as the
  // count of the new ones.
  const settled = Boolean(data) && !audit.isPlaceholderData && !typing;
  const pages = data
    ? Math.max(1, Math.ceil(Math.min(data.totalCount, 200 * AUDIT_PAGE_SIZE) / AUDIT_PAGE_SIZE))
    : 1;
  const filtered = hasAuditFilters(state);
  // Each change builds on the last one written, not on this render's URL:
  // the router re-renders after a navigation, and a second filter changed
  // before that (or the debounced search landing after it) would otherwise
  // write the old URL back and drop the first. React Router's functional
  // update doesn't help: it hands over the params of the render that made it.
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);
  const write = (next: AuditState, replace: boolean) => {
    const search = writeAudit(next);
    latest.current = search;
    setParams(search, { replace });
  };
  const update = (patch: Partial<AuditState>) =>
    write({ ...readAudit(latest.current), page: 1, ...patch }, true);
  const actorName = data?.items.find((event) => event.actorId === state.actor)?.actorName;
  const query = state.q.trim();

  return (
    <div className="space-y-8">
      <PageHeader title={t('admin.audit.title')} description={t('admin.audit.lead')} />

      <form
        role="search"
        aria-label={t('admin.audit.filters')}
        onSubmit={(event) => event.preventDefault()}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <SearchField value={state.q} onCommit={(q) => update({ q })} onTyping={setTyping} />
        <ActorCombobox
          value={state.actor}
          knownName={actorName ?? undefined}
          onChange={(actor) => update({ actor })}
        />
        <Select
          label={t('admin.audit.entity')}
          value={state.type}
          onChange={(event) => update({ type: event.target.value as AuditEntityType | '' })}
          options={[
            { value: '', label: t('admin.audit.anything') },
            ...AUDIT_ENTITY_TYPES.map((type) => ({
              value: type,
              label: t(`admin.audit.entities.${type}`),
            })),
          ]}
        />
        <DateFilterField
          id="audit-from"
          label={t('admin.audit.from')}
          value={state.from}
          max={state.to || todayIso()}
          onCommit={(from) => update({ from })}
        />
        <DateFilterField
          id="audit-to"
          label={t('admin.audit.to')}
          value={state.to}
          min={state.from || undefined}
          max={todayIso()}
          onCommit={(to) => update({ to })}
        />
      </form>

      <section aria-labelledby="audit-results" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="audit-results" className="sr-only">
            {t('admin.audit.results')}
          </h2>
          <p aria-live="polite" className="text-sm text-muted" data-testid="audit-count">
            {!data
              ? ' '
              : !settled
                ? t('admin.audit.searching')
                : query
                  ? t('admin.audit.countFor', { count: data.totalCount, query })
                  : t('admin.audit.count', { count: data.totalCount })}
          </p>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => write(DEFAULT_AUDIT, true)}>
              {t('policies.clearFilters')}
            </Button>
          )}
        </div>

        {audit.isPending ? (
          <ListSkeleton />
        ) : audit.isError ? (
          <ErrorNotice
            error={audit.error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void audit.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : audit.data.totalCount === 0 && settled ? (
          <EmptyState
            headingLevel="h3"
            title={filtered ? t('admin.audit.noMatchTitle') : t('admin.audit.emptyTitle')}
            body={
              state.q.trim()
                ? t('admin.audit.noMatchSearch', { query: state.q.trim() })
                : filtered
                  ? t('admin.audit.noMatchBody')
                  : t('admin.audit.emptyBody')
            }
          />
        ) : (
          <ol
            aria-busy={!settled}
            className={cx(
              'stagger divide-y divide-line border-y border-line transition-opacity duration-(--duration-fast)',
              !settled && 'opacity-60',
            )}
          >
            {audit.data.items.map((event) => (
              <Event key={`${event.entityType}-${event.id}`} event={event} />
            ))}
          </ol>
        )}

        {data && data.totalCount > 0 && pages > 1 && (
          <Pagination
            page={Math.min(state.page, pages)}
            pages={pages}
            label={t('admin.audit.pagination')}
            onChange={(page) => write({ ...readAudit(latest.current), page }, false)}
          />
        )}
      </section>
    </div>
  );
}

// Free-text search over the feed. Typing is debounced (300ms) before it
// reaches the URL and the API; the URL stays the source of truth, so Back,
// a shared link and "Clear filters" all update the box.
function SearchField({
  value,
  onCommit,
  onTyping,
}: {
  value: string;
  onCommit: (q: string) => void;
  onTyping: (typing: boolean) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  // The URL changed from elsewhere (Back, Clear filters): follow it.
  if (value !== committed) {
    setCommitted(value);
    setDraft(value);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // What this field last sent. A URL change that isn't it came from
  // elsewhere, and a pending send must not bring the old text back.
  const sent = useRef(value);
  useEffect(() => {
    if (value !== sent.current) clearTimeout(timer.current);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => onTyping(draft.trim() !== committed.trim()), [draft, committed, onTyping]);

  const change = (next: string) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      sent.current = next;
      setCommitted(next);
      onCommit(next);
    }, 300);
  };

  const clear = () => {
    clearTimeout(timer.current);
    setDraft('');
    sent.current = '';
    setCommitted('');
    onCommit('');
    inputRef.current?.focus();
  };

  return (
    <div className="md:col-span-2 xl:col-span-4">
      <Input
        ref={inputRef}
        id="audit-search"
        // A text field in the searchbox role: type="search" adds the
        // browser's own clear X beside this field's clear button.
        type="text"
        role="searchbox"
        enterKeyHint="search"
        label={t('admin.audit.search')}
        hint={t('admin.audit.searchHint')}
        placeholder={t('admin.audit.searchPlaceholder')}
        value={draft}
        maxLength={AUDIT_SEARCH_MAX}
        autoComplete="off"
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && draft) {
            event.preventDefault();
            clear();
          }
        }}
        trailing={
          draft ? (
            <button
              type="button"
              onClick={clear}
              aria-label={t('admin.audit.clearSearch')}
              className="grid size-10 place-items-center rounded-sm text-muted transition-colors duration-(--duration-fast) hover:text-text"
            >
              <CloseIcon />
            </button>
          ) : (
            <span className="grid size-10 place-items-center text-muted" aria-hidden="true">
              <SearchIcon />
            </span>
          )
        }
      />
    </div>
  );
}

function Event({ event }: { event: AuditEventResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const status = (value: string | null) =>
    value === null
      ? ''
      : t(`${event.entityType === 'Claim' ? 'claimStatus' : 'policyStatus'}.${value}`);

  const subject =
    event.entityType === 'Claim' ? (
      <Link
        to={`/app/claims/${event.entityId}`}
        className="font-medium break-all underline decoration-line-strong underline-offset-4 hover:decoration-current"
      >
        {event.entityLabel}
      </Link>
    ) : event.entityType === 'Customer' ? (
      <Link
        to={`/app/customers/${event.entityId}`}
        className="font-medium break-words underline decoration-line-strong underline-offset-4 hover:decoration-current"
      >
        {event.entityLabel}
      </Link>
    ) : (
      <span className="font-medium break-all">{event.entityLabel}</span>
    );

  const what =
    event.action === 'StatusChanged'
      ? event.fromValue === null
        ? t('admin.audit.actions.created', { status: status(event.toValue) })
        : t('admin.audit.actions.statusChanged', {
            from: status(event.fromValue),
            to: status(event.toValue),
          })
      : event.action === 'RoleChanged'
        ? t('admin.audit.actions.RoleChanged', {
            from: t(`roles.${event.fromValue ?? ''}`),
            to: t(`roles.${event.toValue ?? ''}`),
          })
        : event.action === 'StaffCreated'
          ? t('admin.audit.actions.StaffCreated', { role: t(`roles.${event.toValue ?? ''}`) })
          : event.action === 'CustomerAssigned'
            ? event.toValue
              ? t('admin.audit.actions.assigned', { agent: event.toValue })
              : t('admin.audit.actions.released', { agent: event.fromValue ?? '' })
            : t(`admin.audit.actions.${event.action}`);

  return (
    <li className="grid gap-1 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
      <time dateTime={event.occurredAt} className="text-sm text-muted tabular">
        {format.dateTime(event.occurredAt)}
      </time>
      <div className="min-w-0 space-y-1">
        <p className="break-words">
          <span className="text-sm text-muted">
            {t(`admin.audit.entities.${event.entityType}`)}{' '}
          </span>
          {subject}
          <span> · {what}</span>
        </p>
        <p className="text-sm text-muted">
          {event.actorName
            ? t('admin.audit.by', {
                name: event.actorName,
                role: t(`roles.${event.actorRole ?? ''}`),
              })
            : t('admin.audit.unknownActor')}
        </p>
      </div>
    </li>
  );
}
