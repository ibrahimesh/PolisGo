import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useExclusive } from '../../lib/hooks';
import { policiesApi } from '../../api/endpoints';
import type { PolicyTypeCode } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../components/ui/FormErrorSummary';
import { AlertIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { firstFieldMessageKey } from '../../i18n/apiErrors';
import { useFormatters } from '../../i18n/format';
import { useInvalidateCabinet, useProfile, useVehicles } from '../cabinet/queries';
import { endDateFor } from '../policies/policyDates';
import { useProductName } from '../policies/useProductName';
import { QuotePanel } from './QuotePanel';
import { reviewSchema } from './wizardSchema';
import type { ReviewValues } from './wizardSchema';
import { valuesKey } from './wizardState';
import { useWizard } from './WizardContext';

export function ReviewStep() {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const invalidate = useInvalidateCabinet();
  const { state, setDraft, goTo } = useWizard();
  const profile = useProfile();
  const vehicles = useVehicles();
  const [serverError, setServerError] = useState<unknown>(null);
  const exclusive = useExclusive();
  const { values } = state;
  const vehicle = vehicles.data?.find((v) => v.id === values.vehicleId);

  const { register, handleSubmit, formState } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    mode: 'onTouched',
    // Returning from payment means it was already accepted for this draft.
    defaultValues: { accept: state.draft !== null },
  });

  const onSubmit = handleSubmit(() =>
    exclusive(async () => {
      setServerError(null);
      try {
        const key = valuesKey(values);
        // The draft for exactly these answers already exists (back from payment,
        // or a reload): reuse it rather than creating a duplicate.
        if (!state.draft || state.draft.valuesKey !== key) {
          const policy = await policiesApi.create({
            ...values,
            policyTypeCode: values.policyTypeCode as PolicyTypeCode,
          });
          setDraft({
            id: policy.id,
            policyNumber: policy.policyNumber,
            premium: policy.premium,
            currency: policy.currency,
            valuesKey: key,
          });
          void invalidate();
        }
        await goTo('payment');
      } catch (error) {
        setServerError(error);
      }
    }),
  );

  const { errors, isSubmitting, submitCount } = formState;

  return (
    <div className="grid gap-10 xl:grid-cols-12">
      <form
        noValidate
        aria-labelledby="wizard-step-title"
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-8 xl:col-span-7"
      >
        <FormErrorSummary
          errors={errors}
          fields={[{ name: 'accept', id: 'review-accept', label: t('wizard.review.acceptLabel') }]}
          show={submitCount > 0}
        />
        {serverError !== null && (
          <ErrorNotice
            error={serverError}
            overrides={{ 400: firstFieldMessageKey(serverError) }}
            action={
              <Button variant="secondary" size="sm" onClick={() => void goTo('cover')}>
                {t('wizard.editCover')}
              </Button>
            }
          />
        )}

        <dl className="divide-y divide-line border-y border-line">
          <Row label={t('wizard.fields.type')} onEdit={() => void goTo('cover')}>
            {product.name(values.policyTypeCode)}
            <span className="block text-sm text-muted">{product.hint(values.policyTypeCode)}</span>
          </Row>
          <Row label={t('wizard.review.period')} onEdit={() => void goTo('cover')}>
            {t('policy.periodValue', {
              from: format.date(values.startDate),
              to: format.date(endDateFor(values.startDate, values.termMonths)),
            })}
            <span className="block text-sm text-muted">
              {t('calculator.termOption', { count: values.termMonths })}
            </span>
          </Row>
          <Row label={t('wizard.fields.vehicle')} onEdit={() => void goTo('vehicle')}>
            {vehicle ? (
              <>
                {vehicle.plateNumber} · {vehicle.make} {vehicle.model}, {vehicle.year}
                <span className="block text-sm break-all text-muted">VIN {vehicle.vin}</span>
              </>
            ) : (
              <Skeleton className="h-5 w-48" />
            )}
          </Row>
          <Row label={t('certificate.holder')}>
            {profile.data ? (
              <>
                {profile.data.fullName}
                {profile.data.birthDate && profile.data.drivingLicenseDate && (
                  <span className="block text-sm text-muted">
                    {t('wizard.review.driver', {
                      birth: format.date(profile.data.birthDate),
                      licence: format.date(profile.data.drivingLicenseDate),
                    })}
                  </span>
                )}
              </>
            ) : (
              <Skeleton className="h-5 w-48" />
            )}
          </Row>
        </dl>
        <p className="text-sm text-muted">{t('wizard.review.pricedFrom')}</p>
        {state.draft && (
          <p className="text-sm text-muted">
            {t('wizard.review.draftNote', { number: state.draft.policyNumber })}
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="review-accept" className="flex cursor-pointer items-start gap-3">
            <input
              id="review-accept"
              type="checkbox"
              aria-invalid={errors.accept ? true : undefined}
              aria-describedby={errors.accept ? 'review-accept-error' : undefined}
              className="mt-1 size-4 shrink-0 accent-accent"
              {...register('accept')}
            />
            <span>{t('wizard.review.accept')}</span>
          </label>
          {errors.accept?.message && (
            <p id="review-accept-error" className="flex items-start gap-1.5 text-sm text-danger">
              <span className="mt-0.5 shrink-0">
                <AlertIcon />
              </span>
              {t(errors.accept.message)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6">
          <Button variant="ghost" size="lg" onClick={() => void goTo('vehicle')}>
            {t('wizard.back')}
          </Button>
          <Button type="submit" size="lg" loading={isSubmitting}>
            {t('wizard.review.confirm')}
          </Button>
        </div>
      </form>

      <aside
        aria-label={t('wizard.quote.label')}
        className="xl:sticky xl:top-24 xl:col-span-5 xl:self-start"
      >
        <QuotePanel values={values} />
      </aside>
    </div>
  );
}

function Row({
  label,
  children,
  onEdit,
}: {
  label: string;
  children: ReactNode;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-start sm:gap-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
      {onEdit && (
        <dd>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-sm text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            {t('wizard.review.edit')}
            <span className="sr-only"> — {label}</span>
          </button>
        </dd>
      )}
    </div>
  );
}
