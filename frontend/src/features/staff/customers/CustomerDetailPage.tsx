import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { isApiError } from '../../../api/errors';
import type { CustomerDetailResponse, PolicyResponse } from '../../../api/types';
import { useAuth } from '../../../auth/AuthContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { ArrowLeftIcon } from '../../../components/ui/icons';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Caption, Table, TBody, Td, Th, THead, Tr } from '../../../components/ui/Table';
import { useFormatters } from '../../../i18n/format';
import { ClaimStatusBadge } from '../../claims/ClaimStatusBadge';
import { PolicyStatusBadge } from '../../policies/PolicyStatusBadge';
import { useProductName } from '../../policies/useProductName';
import { rolesFor } from '../../workspace/sections';
import { useCustomer } from '../queries';
import { AssignAgent } from '../../admin/customers/AssignAgent';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const customer = useCustomer(id);

  const back = (
    <Link
      to="/app/customers"
      className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <ArrowLeftIcon />
      {t('staff.customers.back')}
    </Link>
  );

  if (customer.isPending) {
    return (
      <div className="space-y-8" aria-busy="true">
        {back}
        <span className="sr-only" role="status">
          {t('common.loading')}
        </span>
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (customer.isError) {
    // Another agent's customer and an unknown id answer the same 404.
    if (isApiError(customer.error) && customer.error.status === 404) {
      return (
        <div className="space-y-4">
          {back}
          <EmptyState
            headingLevel="h1"
            title={t('staff.customers.notFoundTitle')}
            body={t('staff.customers.notFoundBody')}
            action={
              <ButtonLink to="/app/customers" variant="secondary">
                {t('staff.customers.back')}
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
          error={customer.error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void customer.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return <Detail customer={customer.data} back={back} />;
}

function Detail({ customer, back }: { customer: CustomerDetailResponse; back: ReactNode }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { user } = useAuth();
  // Selling is for an agent's own customer; an Admin sells as the house.
  const canSell = user !== null && rolesFor('customers').includes(user.role);

  return (
    <div className="space-y-10">
      <PageHeader
        before={back}
        title={customer.fullName}
        description={t('staff.customers.since', {
          date: format.date(customer.createdAt.slice(0, 10)),
        })}
        actions={
          canSell ? (
            <ButtonLink to={`/app/customers/${customer.id}/sell`}>
              {t('staff.sell.start')}
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="grid gap-10 xl:grid-cols-12">
        <div className="h-fit space-y-8 xl:col-span-5">
          <Card
            variant="paper"
            as="section"
            aria-labelledby="customer-facts-title"
            className="p-6 sm:p-8"
          >
            <h2 id="customer-facts-title" className="font-sans text-base font-medium">
              {t('staff.customers.profile')}
            </h2>
            <dl className="mt-2 divide-y divide-paper-line">
              <Fact label={t('workspace.email')}>
                <a
                  href={`mailto:${customer.email}`}
                  className="break-all underline decoration-paper-line underline-offset-4 hover:decoration-current"
                >
                  {customer.email}
                </a>
              </Fact>
              <Fact label={t('staff.customers.phone')}>
                <a
                  href={`tel:${customer.phone.replace(/\s+/g, '')}`}
                  className="tabular underline decoration-paper-line underline-offset-4 hover:decoration-current"
                >
                  {customer.phone}
                </a>
              </Fact>
              <Fact label={t('staff.customers.birthDate')}>{format.date(customer.birthDate)}</Fact>
              <Fact label={t('staff.customers.licenceDate')}>
                {format.date(customer.drivingLicenseDate)}
              </Fact>
              <Fact label={t('staff.customers.account')}>
                {customer.hasAccount
                  ? t('staff.customers.hasAccount')
                  : t('staff.customers.noAccount')}
              </Fact>
              <Fact label={t('staff.customers.agent')}>
                {customer.agentName ?? t('staff.customers.noAgent')}
              </Fact>
            </dl>
          </Card>
          {user?.role === 'Admin' && <AssignAgent customer={customer} />}
        </div>

        <div className="min-w-0 space-y-10 xl:col-span-7">
          <Vehicles customer={customer} />
          <Policies policies={customer.policies} />
          <Claims customer={customer} />
        </div>
      </div>
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

function Vehicles({ customer }: { customer: CustomerDetailResponse }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="customer-vehicles-title" className="space-y-4">
      <h2 id="customer-vehicles-title" className="text-2xl">
        {t('staff.customers.vehicles')}
      </h2>
      {customer.vehicles.length === 0 ? (
        <p className="text-muted">{t('staff.customers.noVehicles')}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {customer.vehicles.map((vehicle) => (
            <li key={vehicle.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
              <span className="font-medium">
                {vehicle.make} {vehicle.model} {vehicle.year}
              </span>
              <span className="text-muted tabular">{vehicle.plateNumber}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Policies({ policies }: { policies: readonly PolicyResponse[] }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  return (
    <section aria-labelledby="customer-policies-title" className="space-y-4">
      <h2 id="customer-policies-title" className="text-2xl">
        {t('staff.customers.policies')}
      </h2>
      <p className="text-sm text-muted">{t('staff.customers.policiesScope')}</p>
      {policies.length === 0 ? (
        <p className="text-muted">{t('staff.customers.noPolicies')}</p>
      ) : (
        <>
          {/* Phones: one card per policy; a sideways-scrolling table has
              nothing focusable to scroll it with the keyboard. */}
          <ul className="divide-y divide-line border-y border-line md:hidden">
            {policies.map((policy) => (
              <li key={policy.id} className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-medium break-all">{policy.policyNumber}</span>
                  <PolicyStatusBadge status={policy.status} />
                </div>
                <p className="text-sm text-muted">
                  {product.name(policy.policyTypeCode)} · {policy.vehicle.plateNumber}
                </p>
                <div className="flex flex-wrap justify-between gap-x-4 text-sm tabular">
                  <span>
                    {format.date(policy.startDate)} – {format.date(policy.endDate)}
                  </span>
                  <span className="font-medium">{format.money(policy.premium)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <Caption>{t('staff.customers.policies')}</Caption>
              <THead>
                <Tr className="border-line">
                  <Th>{t('staff.sales.columns.policy')}</Th>
                  <Th>{t('staff.sales.columns.period')}</Th>
                  <Th className="text-right">{t('staff.sales.columns.premium')}</Th>
                  <Th>{t('claims.columns.status')}</Th>
                </Tr>
              </THead>
              <TBody>
                {policies.map((policy) => (
                  <Tr key={policy.id} className="border-line">
                    <Td>
                      <span className="font-medium break-all">{policy.policyNumber}</span>
                      <span className="block text-sm text-muted">
                        {product.name(policy.policyTypeCode)} · {policy.vehicle.plateNumber}
                      </span>
                    </Td>
                    <Td className="text-sm whitespace-nowrap">
                      {format.date(policy.startDate)} – {format.date(policy.endDate)}
                    </Td>
                    <Td className="text-right whitespace-nowrap">{format.money(policy.premium)}</Td>
                    <Td>
                      <PolicyStatusBadge status={policy.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}

function Claims({ customer }: { customer: CustomerDetailResponse }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { user } = useAuth();
  // The claim review page is the adjusters' (and Admins'); agents read here.
  const canOpenClaim = user !== null && rolesFor('claims').includes(user.role);
  const { claims } = customer;
  const counts = claims.byStatus.filter((entry) => entry.count > 0);

  return (
    <section aria-labelledby="customer-claims-title" className="space-y-4">
      <h2 id="customer-claims-title" className="text-2xl">
        {t('staff.customers.claims')}
      </h2>
      {claims.total === 0 ? (
        <p className="text-muted">{t('staff.customers.noClaims')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {counts.map((entry) => (
              <div key={entry.status} className="space-y-1">
                <dt className="text-sm text-muted">{t(`claimStatus.${entry.status}`)}</dt>
                <dd className="font-serif text-xl tabular">{format.integer(entry.count)}</dd>
              </div>
            ))}
            <div className="space-y-1">
              <dt className="text-sm text-muted">{t('staff.customers.paidOut')}</dt>
              <dd className="font-serif text-xl tabular">{format.money(claims.paidAmount)}</dd>
            </div>
          </dl>
          <ul className="divide-y divide-line border-y border-line">
            {claims.recent.map((claim) => (
              <li
                key={claim.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
              >
                <div className="min-w-0">
                  {canOpenClaim ? (
                    <Link
                      to={`/app/claims/${claim.id}`}
                      className="font-medium break-all underline decoration-line-strong underline-offset-4 hover:decoration-current"
                    >
                      {claim.claimNumber}
                    </Link>
                  ) : (
                    <span className="font-medium break-all">{claim.claimNumber}</span>
                  )}
                  <span className="block text-sm text-muted tabular">
                    {format.date(claim.incidentDate.slice(0, 10))} ·{' '}
                    {format.money(claim.claimedAmount)}
                  </span>
                </div>
                <ClaimStatusBadge status={claim.status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
