import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CLAIM_STATUSES } from '../../api/types';
import type { UserRole } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/layout/PageHeader';
import { ChevronDownIcon } from '../../components/ui/icons';

// Grouped questions, by role: customers read about buying and claiming,
// staff about their desks. Native <details>/<summary>: keyboard, screen-reader
// state and find-in-page work with no script, and every answer stays in the DOM.
const CLIENT_GROUPS = {
  buying: ['price', 'exact', 'dates', 'payment', 'renew'],
  policies: ['certificate', 'expired', 'cancel', 'reminders'],
  claims: ['claims', 'claimDocs', 'claimStatuses', 'claimWithdraw', 'claimUpdates'],
  account: ['details', 'password', 'preferences', 'licensed'],
} as const;

// Keys under staff.help: the decision desk for Adjusters, the customer book
// for Agents; Admins work both.
const STAFF_GROUPS = {
  decisions: ['queue', 'takeReview', 'decide', 'reason', 'unavailable', 'conflict', 'pay'],
  book: ['book', 'sell', 'agentClaims'],
  exports: ['export', 'exportExcel'],
} as const;
type StaffGroup = keyof typeof STAFF_GROUPS;

const STAFF_GROUPS_BY_ROLE: Record<Exclude<UserRole, 'Client'>, readonly StaffGroup[]> = {
  Adjuster: ['decisions', 'exports'],
  Agent: ['book', 'exports'],
  Admin: ['decisions', 'book', 'exports'],
};

export function HelpPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const staffRole = user && user.role !== 'Client' ? user.role : null;

  return (
    <div className="space-y-12">
      <PageHeader
        title={t('help.title')}
        description={staffRole ? t('staff.help.lead') : t('help.lead')}
      />

      {staffRole
        ? STAFF_GROUPS_BY_ROLE[staffRole].map((group) => (
            <Group
              key={group}
              id={group}
              title={t(`staff.help.groups.${group}`)}
              items={STAFF_GROUPS[group].map((item) => ({
                id: item,
                q: t(`staff.help.items.${item}.q`),
                a: t(`staff.help.items.${item}.a`),
              }))}
            />
          ))
        : Object.entries(CLIENT_GROUPS).map(([group, questions]) => (
            <Group
              key={group}
              id={group}
              title={t(`help.groups.${group}`)}
              items={questions.map((item) => ({
                id: item,
                q: t(`help.items.${item}.q`),
                a: t(`help.items.${item}.a`),
              }))}
            />
          ))}

      {staffRole && <StatusGlossary />}

      <p className="border-t border-line pt-8 text-muted">
        {t('help.more')}{' '}
        <Link to="/#faq" className="text-accent underline underline-offset-4">
          {t('help.moreLink')}
        </Link>
      </p>
    </div>
  );
}

function Group({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: readonly { id: string; q: string; a: string }[];
}) {
  return (
    <section aria-labelledby={`help-${id}`} className="grid gap-6 lg:grid-cols-12">
      <h2 id={`help-${id}`} className="text-xl lg:col-span-4">
        {title}
      </h2>
      <div className="border-t border-line lg:col-span-8">
        {items.map((item) => (
          <details key={item.id} className="group border-b border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <span className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180">
                <ChevronDownIcon />
              </span>
            </summary>
            <p className="max-w-2xl pb-6 text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// What each claim status means for the person working it.
function StatusGlossary() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="help-statuses" className="grid gap-6 lg:grid-cols-12">
      <h2 id="help-statuses" className="text-xl lg:col-span-4">
        {t('staff.help.groups.statuses')}
      </h2>
      <dl className="divide-y divide-line border-y border-line lg:col-span-8">
        {CLAIM_STATUSES.map((status) => (
          <div key={status} className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="font-medium">{t(`claimStatus.${status}`)}</dt>
            <dd className="text-muted">{t(`staff.help.statuses.${status}`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
