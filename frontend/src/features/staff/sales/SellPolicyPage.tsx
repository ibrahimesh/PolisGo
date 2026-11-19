import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Link, useParams } from 'react-router';
import { policiesApi } from '../../../api/endpoints';
import { isApiError } from '../../../api/errors';
import type {
  CustomerDetailResponse,
  PayPolicyResponse,
  PolicyResponse,
  PolicyTypeCode,
} from '../../../api/types';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cx } from '../../../components/ui/cx';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../../components/ui/FormErrorSummary';
import type { SummaryField } from '../../../components/ui/FormErrorSummary';
import { AlertIcon, ArrowLeftIcon } from '../../../components/ui/icons';
import { FormDateField } from '../../../components/ui/FormDateField';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/ToastProvider';
import { firstFieldMessageKey } from '../../../i18n/apiErrors';
import { useFormatters } from '../../../i18n/format';
import { useDebouncedValue, useExclusive } from '../../../lib/hooks';
import { applyServerFieldErrors } from '../../auth/applyServerErrors';
import { useInvalidateCabinet } from '../../cabinet/queries';
import { usePolicyTypes } from '../../landing/usePolicyTypes';
import { endDateFor } from '../../policies/policyDates';
import { useProductName } from '../../policies/useProductName';
import { QuoteResult } from '../../quote/QuoteResult';
import { VehicleForm } from '../../vehicles/VehicleForm';
import { createCoverSchema, startDateBounds, vehicleChoiceSchema } from '../../wizard/wizardSchema';
import { staffKeys, useCustomer, useCustomerVehicles } from '../queries';

// Selling on a customer's behalf: the purchase wizard's rules, schema and
// quote panel on one page. The API prices from the customer's stored data,
// records the agent on the policy, and refuses a customer outside the
// agent's book (404).
const FIELDS = ['vehicleId', 'policyTypeCode', 'startDate', 'termMonths'] as const;
type Field = (typeof FIELDS)[number];
const fieldId = (field: Field) =>
  field === 'vehicleId' || field === 'policyTypeCode' ? `sell-${field}-0` : `sell-${field}`;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const createSellSchema = () => createCoverSchema().extend(vehicleChoiceSchema.shape);
type SellInput = z.input<ReturnType<typeof createSellSchema>>;
type SellValues = z.output<ReturnType<typeof createSellSchema>>;

export function SellPolicyPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const customer = useCustomer(id);

  const back = (
    <Link
      to={`/app/customers/${id}`}
      className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <ArrowLeftIcon />
      {t('staff.sell.back')}
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
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (customer.isError) {
    return (
      <div className="space-y-6">
        {back}
        {isApiError(customer.error) && customer.error.status === 404 ? (
          <EmptyState
            headingLevel="h1"
            title={t('staff.customers.notFoundTitle')}
            body={t('staff.customers.notFoundBody')}
          />
        ) : (
          <ErrorNotice error={customer.error} />
        )}
      </div>
    );
  }

  return <Sell customer={customer.data} back={back} />;
}

type Stage =
  | { kind: 'form' }
  | { kind: 'draft'; policy: PolicyResponse }
  | { kind: 'paid'; receipt: PayPolicyResponse };

function Sell({ customer, back }: { customer: CustomerDetailResponse; back: React.ReactNode }) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>({ kind: 'form' });

  return (
    <div className="space-y-10">
      <PageHeader
        before={back}
        title={t('staff.sell.title')}
        description={t('staff.sell.lead', { name: customer.fullName })}
      />
      {stage.kind === 'form' && (
        <SellForm customer={customer} onDraft={(policy) => setStage({ kind: 'draft', policy })} />
      )}
      {stage.kind === 'draft' && (
        <DraftStep
          policy={stage.policy}
          onPaid={(receipt) => setStage({ kind: 'paid', receipt })}
        />
      )}
      {stage.kind === 'paid' && <Done customer={customer} receipt={stage.receipt} />}
    </div>
  );
}

function SellForm({
  customer,
  onDraft,
}: {
  customer: CustomerDetailResponse;
  onDraft: (policy: PolicyResponse) => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const types = usePolicyTypes();
  const vehicles = useCustomerVehicles(customer.id);
  const invalidate = useInvalidateCabinet();
  const schema = useMemo(() => createSellSchema(), []);
  const bounds = useMemo(() => startDateBounds(), []);
  const exclusive = useExclusive();
  const [serverError, setServerError] = useState<unknown>(null);
  const [addingVehicle, setAddingVehicle] = useState(false);

  const { register, control, handleSubmit, setError, setValue, formState } = useForm<
    SellInput,
    unknown,
    SellValues
  >({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    // Radios can't take RHF's focus; the invalid handler focuses in field order.
    shouldFocusError: false,
    defaultValues: { vehicleId: '', policyTypeCode: '', startDate: bounds.min, termMonths: '12' },
  });
  const watched = useWatch({ control });

  const labels: Record<Field, string> = {
    vehicleId: t('staff.sell.vehicle'),
    policyTypeCode: t('wizard.fields.type'),
    startDate: t('wizard.fields.startDate'),
    termMonths: t('wizard.fields.term'),
  };
  const summary: SummaryField<SellInput>[] = FIELDS.map((name) => ({
    name,
    id: fieldId(name),
    label: labels[name],
  }));

  const request = (values: SellValues) => ({
    vehicleId: values.vehicleId,
    policyTypeCode: values.policyTypeCode as PolicyTypeCode,
    startDate: values.startDate,
    termMonths: values.termMonths,
    customerId: customer.id,
  });

  const submit = handleSubmit(
    (values) =>
      exclusive(async () => {
        setServerError(null);
        try {
          const policy = await policiesApi.create(request(values));
          await invalidate();
          onDraft(policy);
        } catch (error) {
          const matched = applyServerFieldErrors(error, FIELDS, setError);
          if (matched[0]) document.getElementById(fieldId(matched[0]))?.focus();
          else setServerError(error);
        }
      }),
    (invalid) => {
      const first = FIELDS.find((field) => invalid[field]);
      if (first) document.getElementById(fieldId(first))?.focus();
    },
  );

  const { errors, isSubmitting, submitCount } = formState;
  const parsed = schema.safeParse(watched);
  const endDate =
    watched.startDate && !errors.startDate && Number(watched.termMonths) > 0
      ? endDateFor(watched.startDate, Number(watched.termMonths))
      : null;

  return (
    <div className="grid gap-10 xl:grid-cols-12">
      <div className="min-w-0 space-y-8 xl:col-span-7">
        {/* The vehicle form is its own <form>, so it sits outside the sale's:
          nested forms would submit both at once. */}
        {addingVehicle && (
          <Card className="p-6">
            <VehicleForm
              customerId={customer.id}
              onCancel={() => setAddingVehicle(false)}
              onCreated={(vehicle) => {
                setAddingVehicle(false);
                void invalidate().then(() =>
                  setValue('vehicleId', vehicle.id, { shouldValidate: true }),
                );
              }}
            />
          </Card>
        )}
        <form
          noValidate
          aria-label={t('staff.sell.title')}
          onSubmit={(event) => void submit(event)}
          className="space-y-8"
        >
          <FormErrorSummary errors={errors} fields={summary} show={submitCount > 0} />
          {serverError !== null && (
            <ErrorNotice
              error={serverError}
              overrides={{ 400: firstFieldMessageKey(serverError) }}
            />
          )}

          <fieldset
            aria-describedby={errors.vehicleId ? 'sell-vehicleId-error' : undefined}
            className="space-y-3"
          >
            <legend className="mb-3 text-sm font-medium">{labels.vehicleId}</legend>
            {vehicles.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : vehicles.isError ? (
              <ErrorNotice error={vehicles.error} />
            ) : vehicles.data.length === 0 ? (
              <p className="text-muted">{t('staff.sell.noVehicles')}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {vehicles.data.map((vehicle, index) => (
                  <Choice key={vehicle.id} checked={watched.vehicleId === vehicle.id}>
                    <input
                      type="radio"
                      id={`sell-vehicleId-${index}`}
                      value={vehicle.id}
                      className="mt-1 size-4 shrink-0 accent-accent"
                      {...register('vehicleId')}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {vehicle.make} {vehicle.model} {vehicle.year}
                      </span>
                      <span className="block text-sm text-muted tabular">
                        {vehicle.plateNumber}
                      </span>
                    </span>
                  </Choice>
                ))}
              </div>
            )}
            <FieldError id="sell-vehicleId-error" message={errors.vehicleId?.message} />
            {!addingVehicle && (
              <Button variant="ghost" size="sm" onClick={() => setAddingVehicle(true)}>
                {t('staff.sell.addVehicle')}
              </Button>
            )}
          </fieldset>

          <fieldset
            aria-describedby={errors.policyTypeCode ? 'sell-policyTypeCode-error' : undefined}
            className="space-y-3"
          >
            <legend className="mb-3 text-sm font-medium">{labels.policyTypeCode}</legend>
            {types.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : types.isError ? (
              <ErrorNotice error={types.error} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {types.data.map((type, index) => (
                  <Choice key={type.code} checked={watched.policyTypeCode === type.code}>
                    <input
                      type="radio"
                      id={`sell-policyTypeCode-${index}`}
                      value={type.code}
                      className="mt-1 size-4 shrink-0 accent-accent"
                      {...register('policyTypeCode')}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{product.name(type.code)}</span>
                      <span className="block text-sm text-muted">{product.hint(type.code)}</span>
                    </span>
                  </Choice>
                ))}
              </div>
            )}
            <FieldError id="sell-policyTypeCode-error" message={errors.policyTypeCode?.message} />
          </fieldset>

          <div className="grid gap-6 sm:grid-cols-2">
            <FormDateField
              id={fieldId('startDate')}
              control={control}
              name="startDate"
              label={labels.startDate}
              min={bounds.min}
              max={bounds.max}
              hint={t('wizard.fields.startDateHint')}
              error={errors.startDate?.message}
            />
            <Select
              id={fieldId('termMonths')}
              label={labels.termMonths}
              error={errors.termMonths?.message}
              options={MONTHS.map((months) => ({
                value: months,
                label: t('calculator.termOption', { count: months }),
              }))}
              {...register('termMonths')}
            />
          </div>
          {endDate && (
            <p className="text-sm text-muted tabular">
              {t('wizard.coverEnds', { date: format.date(endDate) })}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-6">
            <Button type="submit" size="lg" loading={isSubmitting}>
              {t('staff.sell.createDraft')}
            </Button>
          </div>
        </form>
      </div>

      <aside
        aria-label={t('wizard.quote.label')}
        className="xl:sticky xl:top-24 xl:col-span-5 xl:self-start"
      >
        <LiveQuote
          customerId={customer.id}
          values={parsed.success ? request(parsed.data) : null}
          termMonths={Number(watched.termMonths) || 12}
          productCode={watched.policyTypeCode ?? ''}
        />
      </aside>
    </div>
  );
}

function Choice({ checked, children }: { checked: boolean; children: React.ReactNode }) {
  return (
    <label
      className={cx(
        'flex cursor-pointer gap-3 rounded-sm border p-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
        checked ? 'border-accent bg-surface-2' : 'border-line-strong hover:bg-surface-2',
      )}
    >
      {children}
    </label>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-danger">
      <span className="mt-0.5 shrink-0">
        <AlertIcon />
      </span>
      {t(message)}
    </p>
  );
}

// The premium the customer will be charged: POST /api/policies/quote with
// their stored data, debounced, the last figure kept (dimmed) while the next
// one loads.
function LiveQuote({
  customerId,
  values,
  termMonths,
  productCode,
}: {
  customerId: string;
  values: Parameters<typeof policiesApi.quote>[0] | null;
  termMonths: number;
  productCode: string;
}) {
  const { t } = useTranslation();
  const product = useProductName();
  const debounced = useDebouncedValue(values, 300);
  const quote = useQuery({
    queryKey: [...staffKeys.all, 'quote', customerId, debounced],
    queryFn: ({ signal }) => {
      // enabled keeps this from running without values.
      if (!debounced) throw new Error('No quote request yet.');
      return policiesApi.quote(debounced, signal);
    },
    enabled: debounced !== null,
    retry: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  if (!values) {
    return (
      <p className="rounded-sm border border-line p-6 text-muted">{t('staff.sell.quoteWaiting')}</p>
    );
  }
  return (
    <div className="space-y-4">
      {(quote.data || !quote.error) && (
        <QuoteResult
          breakdown={quote.data}
          productLabel={product.name(productCode) || '—'}
          termMonths={termMonths}
          updating={quote.isFetching}
          stale={quote.isPlaceholderData || quote.isError}
          label={t('wizard.quote.label')}
          note={t('staff.sell.quoteNote')}
          compact
        />
      )}
      {quote.error && (
        <ErrorNotice
          error={quote.error}
          title={t('wizard.quote.errorTitle')}
          overrides={{ 400: firstFieldMessageKey(quote.error) }}
        />
      )}
    </div>
  );
}

function DraftStep({
  policy,
  onPaid,
}: {
  policy: PolicyResponse;
  onPaid: (receipt: PayPolicyResponse) => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const toast = useToast();
  const invalidate = useInvalidateCabinet();
  const exclusive = useExclusive();
  const [error, setError] = useState<unknown>(null);
  const [paying, setPaying] = useState(false);

  const pay = () =>
    exclusive(async () => {
      setError(null);
      setPaying(true);
      try {
        const receipt = await policiesApi.pay(policy.id);
        await invalidate();
        toast.toast({ tone: 'success', title: t('staff.sell.paidToast') });
        onPaid(receipt);
      } catch (caught) {
        setError(caught);
      } finally {
        setPaying(false);
      }
    });

  return (
    <Card
      variant="paper"
      as="section"
      aria-labelledby="sell-draft-title"
      className="max-w-2xl space-y-6 p-6 sm:p-8"
    >
      <h2 id="sell-draft-title" className="font-serif text-2xl">
        {t('staff.sell.draftTitle', { number: policy.policyNumber })}
      </h2>
      <dl className="divide-y divide-paper-line">
        <Row label={t('wizard.fields.type')}>{product.name(policy.policyTypeCode)}</Row>
        <Row label={t('staff.sell.vehicle')}>
          {policy.vehicle.make} {policy.vehicle.model} · {policy.vehicle.plateNumber}
        </Row>
        <Row label={t('staff.sales.columns.period')}>
          {format.date(policy.startDate)} – {format.date(policy.endDate)}
        </Row>
        <Row label={t('staff.sales.columns.premium')}>
          <span className="font-serif text-2xl tabular">{format.money(policy.premium)}</span>
        </Row>
      </dl>
      <p className="text-paper-muted">{t('staff.sell.draftBody')}</p>
      {error !== null && <ErrorNotice error={error} />}
      <div className="flex flex-wrap gap-3">
        <Button loading={paying} onClick={() => void pay()}>
          {t('staff.sell.takePayment', { amount: format.money(policy.premium) })}
        </Button>
        <ButtonLink to={`/app/customers/${policy.customerId}`} variant="secondary">
          {t('staff.sell.leaveDraft')}
        </ButtonLink>
      </div>
    </Card>
  );
}

function Done({
  customer,
  receipt,
}: {
  customer: CustomerDetailResponse;
  receipt: PayPolicyResponse;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  return (
    <section aria-labelledby="sell-done-title" className="max-w-2xl space-y-4" role="status">
      <h2 id="sell-done-title" className="text-2xl">
        {t('staff.sell.doneTitle', { number: receipt.policy.policyNumber })}
      </h2>
      <p className="text-muted">
        {t('staff.sell.doneBody', {
          name: customer.fullName,
          amount: format.money(receipt.amount),
          reference: receipt.reference,
        })}
      </p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to={`/app/customers/${customer.id}`}>
          {t('staff.sell.backToCustomer')}
        </ButtonLink>
        <ButtonLink to="/app/sales" variant="secondary">
          {t('staff.sell.toSales')}
        </ButtonLink>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3">
      <dt className="text-sm font-medium text-paper-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
