import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useExclusive } from '../../lib/hooks';
import { policiesApi } from '../../api/endpoints';
import { isApiError } from '../../api/errors';
import type { PolicyTypeCode } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../components/ui/FormErrorSummary';
import type { SummaryField } from '../../components/ui/FormErrorSummary';
import { AlertIcon } from '../../components/ui/icons';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFormatters } from '../../i18n/format';
import { firstFieldMessageKey } from '../../i18n/apiErrors';
import { applyServerFieldErrors } from '../auth/applyServerErrors';
import { usePolicyTypes } from '../landing/usePolicyTypes';
import { endDateFor } from '../policies/policyDates';
import { useProductName } from '../policies/useProductName';
import { QuotePanel } from './QuotePanel';
import { createCoverSchema, startDateBounds } from './wizardSchema';
import type { CoverInput, CoverValues } from './wizardSchema';
import { useWizard } from './WizardContext';

const FIELDS = ['policyTypeCode', 'startDate', 'termMonths'] as const;
const id = (field: (typeof FIELDS)[number]) => `cover-${field}`;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function CoverStep() {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const { state, setValues, goTo } = useWizard();
  const types = usePolicyTypes();
  const schema = useMemo(() => createCoverSchema(), []);
  const bounds = useMemo(() => startDateBounds(), []);
  const [serverError, setServerError] = useState<unknown>(null);
  const exclusive = useExclusive();

  const { register, control, handleSubmit, setError, setFocus, formState } = useForm<
    CoverInput,
    unknown,
    CoverValues
  >({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    // Radios can't take RHF's focus; the invalid handler focuses in field order.
    shouldFocusError: false,
    defaultValues: {
      policyTypeCode: state.values.policyTypeCode,
      startDate: state.values.startDate,
      termMonths: String(state.values.termMonths),
    },
  });

  // Every answer is saved as it changes, so a reload keeps it.
  const watched = useWatch({ control });
  useEffect(() => {
    const term = Number(watched.termMonths);
    setValues({
      policyTypeCode: watched.policyTypeCode ?? '',
      startDate: watched.startDate ?? '',
      termMonths: Number.isInteger(term) ? term : state.values.termMonths,
    });
    // setValues is stable in intent; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched.policyTypeCode, watched.startDate, watched.termMonths]);

  const labels = {
    policyTypeCode: t('wizard.fields.type'),
    startDate: t('wizard.fields.startDate'),
    termMonths: t('wizard.fields.term'),
  };
  const summary: SummaryField<CoverInput>[] = FIELDS.map((name) => ({
    name,
    id: name === 'policyTypeCode' ? `${id(name)}-0` : id(name),
    label: labels[name],
  }));

  const onSubmit = handleSubmit(
    (values) =>
      exclusive(async () => {
        setServerError(null);
        try {
          // Server check of the same answers: with a vehicle chosen, the quote
          // endpoint applies every purchase rule (dates, term, overlap).
          if (state.values.vehicleId) {
            await policiesApi.quote({
              ...values,
              policyTypeCode: values.policyTypeCode as PolicyTypeCode,
              vehicleId: state.values.vehicleId,
            });
          }
          await goTo('vehicle');
        } catch (error) {
          const matched = applyServerFieldErrors(error, FIELDS, setError);
          if (matched[0]) setFocus(matched[0] === 'policyTypeCode' ? 'policyTypeCode' : matched[0]);
          // 404: the preselected vehicle is gone; choosing another fixes it.
          else if (isApiError(error) && error.status === 404) await goTo('vehicle');
          else setServerError(error);
        }
      }),
    // RHF can't focus a radio group, so move focus in field order ourselves.
    (invalid) => {
      const first = FIELDS.find((field) => invalid[field]);
      if (first)
        document.getElementById(first === 'policyTypeCode' ? id(first) + '-0' : id(first))?.focus();
    },
  );

  const { errors, isSubmitting, submitCount } = formState;
  const endDate =
    watched.startDate && !errors.startDate && Number(watched.termMonths) > 0
      ? endDateFor(watched.startDate, Number(watched.termMonths))
      : null;

  return (
    <div className="grid gap-10 xl:grid-cols-12">
      <form
        noValidate
        aria-labelledby="wizard-step-title"
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-8 xl:col-span-7"
      >
        <FormErrorSummary errors={errors} fields={summary} show={submitCount > 0} />
        {serverError !== null && (
          <ErrorNotice error={serverError} overrides={{ 400: firstFieldMessageKey(serverError) }} />
        )}

        <fieldset
          aria-describedby={errors.policyTypeCode ? `${id('policyTypeCode')}-error` : undefined}
          className="space-y-3"
        >
          <legend className="mb-3 text-sm font-medium">{labels.policyTypeCode}</legend>
          {types.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : types.isError ? (
            <ErrorNotice error={types.error} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {types.data.map((type, index) => {
                const checked = watched.policyTypeCode === type.code;
                return (
                  <label
                    key={type.code}
                    className={cx(
                      'flex cursor-pointer gap-3 rounded-sm border p-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                      checked
                        ? 'border-accent bg-surface-2'
                        : 'border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <input
                      type="radio"
                      id={`${id('policyTypeCode')}-${index}`}
                      value={type.code}
                      className="mt-1 size-4 shrink-0 accent-accent"
                      {...register('policyTypeCode')}
                    />
                    <span className="min-w-0 space-y-1">
                      <span className="block font-medium">{product.name(type.code)}</span>
                      <span className="block text-sm text-muted">{product.hint(type.code)}</span>
                      <span className="block text-sm text-muted tabular">
                        {t('landing.coverage.fromRate', {
                          amount: format.amount(type.baseRate),
                          currency: type.currency,
                        })}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {errors.policyTypeCode?.message && (
            <p
              id={`${id('policyTypeCode')}-error`}
              className="flex items-start gap-1.5 text-sm text-danger"
            >
              <span className="mt-0.5 shrink-0">
                <AlertIcon />
              </span>
              {t(errors.policyTypeCode.message)}
            </p>
          )}
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            id={id('startDate')}
            label={labels.startDate}
            type="date"
            min={bounds.min}
            max={bounds.max}
            hint={t('wizard.fields.startDateHint')}
            error={errors.startDate?.message}
            {...register('startDate')}
          />
          <Select
            id={id('termMonths')}
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
            {t('wizard.continue')}
          </Button>
        </div>
      </form>

      <aside
        aria-label={t('wizard.quote.label')}
        className="xl:sticky xl:top-24 xl:col-span-5 xl:self-start"
      >
        <QuotePanel values={state.values} />
      </aside>
    </div>
  );
}
