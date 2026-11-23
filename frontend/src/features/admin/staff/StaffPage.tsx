import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { STAFF_ROLES } from '../../../api/types';
import type { StaffMemberResponse, StaffRole, StaffStatusFilter } from '../../../api/types';
import { useAuth } from '../../../auth/AuthContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { PlusIcon, SearchIcon } from '../../../components/ui/icons';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Caption, Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { useFormatters } from '../../../i18n/format';
import { useDebouncedValue } from '../../../lib/hooks';
import { ListSkeleton } from '../../staff/ListSkeleton';
import { useStaff } from '../queries';
import { CreateStaffDialog, StaffActionDialog } from './StaffDialogs';
import type { StaffAction } from './StaffDialogs';
import {
  DEFAULT_STAFF_LIST,
  readStaffList,
  STAFF_PAGE_SIZE,
  STAFF_STATUSES,
  toStaffQuery,
  writeStaffList,
} from './staffSchema';
import type { StaffListState } from './staffSchema';

export function StaffPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = readStaffList(params);
  const resultsId = useId();
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<StaffAction | null>(null);

  const [searchText, setSearchText] = useState(state.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  const update = (patch: Partial<StaffListState>) =>
    setParams(writeStaffList({ ...state, page: 1, ...patch }), { replace: true });

  useEffect(() => {
    if (debouncedSearch.trim() !== state.search.trim()) update({ search: debouncedSearch });
    // Only the debounced text should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const staff = useStaff(toStaffQuery(state));
  const data = staff.data;
  const pages = data ? Math.max(1, Math.ceil(data.totalCount / STAFF_PAGE_SIZE)) : 1;
  const filtered = Boolean(state.search.trim() || state.role || state.status !== 'All');

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('admin.staff.title')}
        description={t('admin.staff.lead')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            {t('admin.staff.add')}
          </Button>
        }
      />

      <form
        role="search"
        aria-label={t('admin.staff.filters')}
        aria-controls={resultsId}
        onSubmit={(event) => {
          event.preventDefault();
          update({ search: searchText });
        }}
        className="grid gap-4 md:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]"
      >
        <Input
          label={t('admin.staff.search')}
          type="search"
          value={searchText}
          maxLength={100}
          placeholder={t('admin.staff.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
          trailing={
            <span className="grid size-10 place-items-center text-muted" aria-hidden="true">
              <SearchIcon />
            </span>
          }
        />
        <Select
          label={t('admin.staff.role')}
          value={state.role}
          onChange={(event) => update({ role: event.target.value as StaffRole | '' })}
          options={[
            { value: '', label: t('admin.staff.allRoles') },
            ...STAFF_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) })),
          ]}
        />
        <Select
          label={t('admin.staff.status')}
          value={state.status}
          onChange={(event) => update({ status: event.target.value as StaffStatusFilter })}
          options={STAFF_STATUSES.map((status) => ({
            value: status,
            label: t(`admin.staff.statuses.${status}`),
          }))}
        />
      </form>

      <section id={resultsId} aria-labelledby={`${resultsId}-title`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${resultsId}-title`} className="sr-only">
            {t('admin.staff.results')}
          </h2>
          <p aria-live="polite" className="text-sm text-muted">
            {data ? t('admin.staff.count', { count: data.totalCount }) : ' '}
          </p>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchText('');
                setParams(writeStaffList(DEFAULT_STAFF_LIST), { replace: true });
              }}
            >
              {t('policies.clearFilters')}
            </Button>
          )}
        </div>

        {staff.isPending ? (
          <ListSkeleton />
        ) : staff.isError ? (
          <ErrorNotice
            error={staff.error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void staff.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : staff.data.totalCount === 0 ? (
          <EmptyState
            headingLevel="h3"
            title={filtered ? t('admin.staff.noMatchTitle') : t('admin.staff.emptyTitle')}
            body={filtered ? t('admin.staff.noMatchBody') : t('admin.staff.emptyBody')}
          />
        ) : (
          <div
            aria-busy={staff.isFetching}
            className={staff.isFetching ? 'opacity-60 transition-opacity' : undefined}
          >
            <StaffCards items={staff.data.items} onAction={setAction} />
            <StaffTable items={staff.data.items} onAction={setAction} />
          </div>
        )}

        {data && data.totalCount > 0 && pages > 1 && (
          <Pagination
            page={Math.min(state.page, pages)}
            pages={pages}
            label={t('admin.staff.pagination')}
            onChange={(page) => setParams(writeStaffList({ ...state, page }))}
          />
        )}
      </section>

      <CreateStaffDialog open={creating} onClose={() => setCreating(false)} />
      <StaffActionDialog action={action} onClose={() => setAction(null)} />
    </div>
  );
}

function StatusBadge({ member }: { member: StaffMemberResponse }) {
  const { t } = useTranslation();
  return member.isActive ? (
    <Badge tone="success">{t('admin.staff.active')}</Badge>
  ) : (
    <Badge tone="neutral">{t('admin.staff.inactive')}</Badge>
  );
}

function Workload({ member }: { member: StaffMemberResponse }) {
  const { t } = useTranslation();
  if (member.role === 'Agent')
    return <>{t('admin.staff.customers', { count: member.customerCount })}</>;
  if (member.role === 'Adjuster')
    return <>{t('admin.staff.openClaims', { count: member.openClaimCount })}</>;
  return <>—</>;
}

// Your own row has no actions: the server refuses them, so the page says so
// instead of offering buttons that fail.
function Actions({
  member,
  onAction,
}: {
  member: StaffMemberResponse;
  onAction: (action: StaffAction) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (member.id === user?.id)
    return <span className="text-sm text-muted">{t('admin.staff.you')}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {/* The name tells rows apart for screen readers; it starts with the
          visible label, so speech input still matches it. */}
      <Button
        variant="secondary"
        size="sm"
        aria-label={`${t('admin.staff.changeRole')}, ${member.fullName}`}
        onClick={() => onAction({ kind: 'role', member })}
      >
        {t('admin.staff.changeRole')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`${member.isActive ? t('admin.staff.deactivate') : t('admin.staff.reactivate')}, ${member.fullName}`}
        onClick={() => onAction({ kind: member.isActive ? 'deactivate' : 'reactivate', member })}
      >
        {member.isActive ? t('admin.staff.deactivate') : t('admin.staff.reactivate')}
      </Button>
    </div>
  );
}

function StaffTable({
  items,
  onAction,
}: {
  items: readonly StaffMemberResponse[];
  onAction: (action: StaffAction) => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  return (
    <div className="hidden md:block">
      <Table>
        <Caption>{t('admin.staff.caption')}</Caption>
        <THead>
          <Tr className="border-line">
            <Th>{t('admin.staff.columns.name')}</Th>
            <Th>{t('admin.staff.role')}</Th>
            <Th>{t('admin.staff.status')}</Th>
            <Th>{t('admin.staff.columns.workload')}</Th>
            <Th>{t('admin.staff.columns.actions')}</Th>
          </Tr>
        </THead>
        <TBody className="stagger">
          {items.map((member) => (
            <Tr key={member.id} className="border-line">
              <Td>
                <span className="block font-medium break-words">{member.fullName}</span>
                <span className="block max-w-64 truncate text-sm text-muted" title={member.email}>
                  {member.email}
                </span>
              </Td>
              <Td>{t(`roles.${member.role}`)}</Td>
              <Td>
                <StatusBadge member={member} />
                {member.deactivatedAt && (
                  <span className="block text-sm text-muted">
                    {format.date(member.deactivatedAt.slice(0, 10))}
                  </span>
                )}
              </Td>
              <Td className="text-sm">
                <Workload member={member} />
              </Td>
              <Td>
                <Actions member={member} onAction={onAction} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function StaffCards({
  items,
  onAction,
}: {
  items: readonly StaffMemberResponse[];
  onAction: (action: StaffAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="stagger divide-y divide-line border-y border-line md:hidden">
      {items.map((member) => (
        <li key={member.id} className="space-y-2 py-4">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 font-medium break-words">{member.fullName}</span>
            <StatusBadge member={member} />
          </div>
          <p className="text-sm break-all text-muted">{member.email}</p>
          <p className="text-sm">
            {t(`roles.${member.role}`)} · <Workload member={member} />
          </p>
          <Actions member={member} onAction={onAction} />
        </li>
      ))}
    </ul>
  );
}
