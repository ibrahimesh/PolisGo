import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { AUDIT_ENTITY_TYPES } from '../../../api/types';
import type { AuditEntityType, AuditEventResponse } from '../../../api/types';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { DateFilterField } from '../../../components/ui/DateFilterField';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { useFormatters } from '../../../i18n/format';
import { todayIso } from '../../../lib/dates';
import { ListSkeleton } from '../../staff/ListSkeleton';
import { useAudit } from '../queries';
import { StaffPicker } from '../StaffPicker';
import {
  AUDIT_PAGE_SIZE,
  DEFAULT_AUDIT,
  hasAuditFilters,
  readAudit,
  toAuditQuery,
  writeAudit,
} from './auditParams';
import type { AuditState } from './auditParams';

// Everything recorded, newest first: claim and policy status changes and the
// staff actions logged since the admin panel shipped. Nothing is inferred.
export function AuditPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readAudit(params);
  const audit = useAudit(toAuditQuery(state));
  const data = audit.data;
  const pages = data
    ? Math.max(1, Math.ceil(Math.min(data.totalCount, 200 * AUDIT_PAGE_SIZE) / AUDIT_PAGE_SIZE))
    : 1;
  const filtered = hasAuditFilters(state);
  const update = (patch: Partial<AuditState>) =>
    setParams(writeAudit({ ...state, page: 1, ...patch }), { replace: true });

  return (
    <div className="space-y-8">
      <PageHeader title={t('admin.audit.title')} description={t('admin.audit.lead')} />

      <form
        role="search"
        aria-label={t('admin.audit.filters')}
        onSubmit={(event) => event.preventDefault()}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <StaffPicker
          label={t('admin.audit.actor')}
          value={state.actor}
          onChange={(actor) => update({ actor })}
          emptyOption={{ value: '', label: t('admin.audit.anyone') }}
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
          <p aria-live="polite" className="text-sm text-muted">
            {data ? t('admin.audit.count', { count: data.totalCount }) : ' '}
          </p>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setParams(writeAudit(DEFAULT_AUDIT), { replace: true })}
            >
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
        ) : audit.data.totalCount === 0 ? (
          <EmptyState
            headingLevel="h3"
            title={filtered ? t('admin.audit.noMatchTitle') : t('admin.audit.emptyTitle')}
            body={filtered ? t('admin.audit.noMatchBody') : t('admin.audit.emptyBody')}
          />
        ) : (
          <ol
            aria-busy={audit.isFetching}
            className={
              audit.isFetching
                ? 'divide-y divide-line border-y border-line opacity-60'
                : 'divide-y divide-line border-y border-line'
            }
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
            onChange={(page) => setParams(writeAudit({ ...state, page }))}
          />
        )}
      </section>
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
