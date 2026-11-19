import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { quotesApi } from '../../api/endpoints';
import { isApiError } from '../../api/errors';
import { POLICY_TYPE_CODES } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { FormDateField } from '../../components/ui/FormDateField';
import { Input } from '../../components/ui/Input';
import { todayIso } from '../../lib/dates';
import { Select } from '../../components/ui/Select';
import { fieldMessageKey } from '../../i18n/apiErrors';
import { useDebouncedValue } from '../../lib/hooks';
import { useLinkedValidation } from '../auth/useLinkedValidation';
import { QuoteResult } from './QuoteResult';
import { createQuoteSchema, DEFAULT_QUOTE, QUOTE_FIELDS } from './quoteSchema';
import type { QuoteFormValues } from './quoteSchema';

export const QUOTE_DEBOUNCE_MS = 400;
const TERM_OPTIONS = Array.from({ length: 12 }, (_, i) => 12 - i);

export function QuoteCalculator() {
  const { t } = useTranslation();
  const schema = useMemo(() => createQuoteSchema(), []);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: DEFAULT_QUOTE,
  });
  const { register, control, formState, setError, trigger, getFieldState } = form;
  // The licence rule is relative to the birth date: recheck it when either
  // changes, once the user has reached it.
  useLinkedValidation(control, trigger, getFieldState, 'driverBirthDate', 'drivingLicenseDate');

  // Price whatever is on screen as soon as it is valid; no submit button.
  const values = useWatch({ control });
  const parsed = schema.safeParse(values);
  const valid = parsed.success ? parsed.data : null;
  const request = useDebouncedValue(valid, QUOTE_DEBOUNCE_MS);
  const pending = valid !== null && JSON.stringify(valid) !== JSON.stringify(request);

  const quote = useQuery({
    queryKey: ['quote', request],
    queryFn: request ? ({ signal }) => quotesApi.calculate(request, signal) : skipToken,
    // Keep the last price on screen while the next one loads — no flicker.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });

  // The API is the final validator: bind its 400 field errors to the inputs.
  useEffect(() => {
    if (!isApiError(quote.error) || quote.error.status !== 400) return;
    for (const [field, messages] of Object.entries(quote.error.fieldErrors)) {
      if ((QUOTE_FIELDS as string[]).includes(field)) {
        setError(field as keyof QuoteFormValues, {
          type: 'server',
          message: fieldMessageKey(messages),
        });
      }
    }
  }, [quote.error, setError]);

  const errors = formState.errors;
  const showRequestError =
    quote.isError && !(isApiError(quote.error) && quote.error.status === 400);
  const product = values.policyTypeCode ?? DEFAULT_QUOTE.policyTypeCode;

  return (
    <div className="grid lg:grid-cols-12 lg:divide-x lg:divide-line">
      <form
        noValidate
        aria-labelledby="quote-form-title"
        onSubmit={(event) => event.preventDefault()}
        className="space-y-8 border-b border-line px-4 py-12 sm:px-6 lg:col-span-4 lg:border-b-0 lg:px-8 lg:py-16"
      >
        <h2 id="quote-form-title" className="font-sans text-lg font-medium tracking-normal">
          {t('calculator.formTitle')}
        </h2>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium text-muted">{t('calculator.product')}</legend>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line">
            {POLICY_TYPE_CODES.map((code) => (
              <label
                key={code}
                className="group flex cursor-pointer flex-col gap-1 bg-surface p-4 transition-colors duration-150 has-checked:bg-surface-2 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  value={code}
                  className="sr-only"
                  {...register('policyTypeCode')}
                />
                <span className="flex items-center justify-between">
                  <span className="font-serif text-lg">{t(`calculator.products.${code}`)}</span>
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full border border-line-strong group-has-checked:border-accent group-has-checked:bg-accent"
                  />
                </span>
                <span className="text-sm text-muted">{t(`calculator.products.${code}Hint`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('calculator.engine')}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            suffix={t('calculator.engineUnit')}
            error={errors.engineCapacityCc?.message}
            {...register('engineCapacityCc', { valueAsNumber: true })}
          />
          <Input
            label={t('calculator.vehicleYear')}
            type="number"
            inputMode="numeric"
            min={1950}
            step={1}
            error={errors.vehicleYear?.message}
            {...register('vehicleYear', { valueAsNumber: true })}
          />
        </div>

        <FormDateField
          control={control}
          name="driverBirthDate"
          label={t('calculator.birthDate')}
          max={todayIso()}
          error={errors.driverBirthDate?.message}
        />
        <FormDateField
          control={control}
          name="drivingLicenseDate"
          label={t('calculator.licenceDate')}
          max={todayIso()}
          error={errors.drivingLicenseDate?.message}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('calculator.claims')}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            error={errors.claimsInLast3Years?.message}
            {...register('claimsInLast3Years', { valueAsNumber: true })}
          />
          <Select
            label={t('calculator.term')}
            error={errors.termMonths?.message}
            options={TERM_OPTIONS.map((months) => ({
              value: months,
              label: t('calculator.termOption', { count: months }),
            }))}
            {...register('termMonths', { valueAsNumber: true })}
          />
        </div>
      </form>

      <div className="space-y-4 px-4 py-12 sm:px-6 lg:col-span-8 lg:px-8 lg:py-16">
        {showRequestError && (
          <ErrorNotice
            error={quote.error}
            title={t('calculator.errorTitle')}
            overrides={{ 404: 'errors.unknownProduct' }}
            action={
              <Button variant="secondary" size="sm" onClick={() => void quote.refetch()}>
                {t('calculator.retry')}
              </Button>
            }
          />
        )}
        {!(showRequestError && !quote.data) && (
          <QuoteResult
            breakdown={quote.data}
            productLabel={t(`calculator.products.${product}`)}
            termMonths={quote.data && request ? request.termMonths : (valid?.termMonths ?? 12)}
            updating={pending || quote.isFetching}
            stale={valid === null}
          />
        )}
        {valid === null && <p className="text-sm text-muted">{t('calculator.waiting')}</p>}
      </div>
    </div>
  );
}
