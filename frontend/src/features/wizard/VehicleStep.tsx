import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useExclusive } from '../../lib/hooks';
import { policiesApi } from '../../api/endpoints';
import type { PolicyTypeCode } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../components/ui/FormErrorSummary';
import { AlertIcon, CarIcon, PlusIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { firstFieldMessageKey } from '../../i18n/apiErrors';
import { useFormatters } from '../../i18n/format';
import { cabinetKeys, useVehicles } from '../cabinet/queries';
import { VehicleForm } from '../vehicles/VehicleForm';
import { QuotePanel } from './QuotePanel';
import { vehicleChoiceSchema } from './wizardSchema';
import type { VehicleChoice } from './wizardSchema';
import { useWizard } from './WizardContext';

export function VehicleStep() {
  const { t } = useTranslation();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const { state, setValues, goTo } = useWizard();
  const vehicles = useVehicles();
  const [adding, setAdding] = useState(false);
  const [serverError, setServerError] = useState<unknown>(null);
  const exclusive = useExclusive();

  const { register, control, handleSubmit, setValue, formState } = useForm<VehicleChoice>({
    resolver: zodResolver(vehicleChoiceSchema),
    mode: 'onTouched',
    // Radios can't take RHF's focus; the invalid handler focuses in field order.
    shouldFocusError: false,
    defaultValues: { vehicleId: state.values.vehicleId },
  });
  const vehicleId = useWatch({ control, name: 'vehicleId' });
  const liveValues = { ...state.values, vehicleId };
  // Saved as it changes, so a reload keeps the choice.
  useEffect(() => {
    setValues({ vehicleId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const onSubmit = handleSubmit(
    ({ vehicleId: chosen }) =>
      exclusive(async () => {
        setServerError(null);
        setValues({ vehicleId: chosen });
        try {
          // Server check of the complete answers before review.
          await policiesApi.quote({
            ...state.values,
            vehicleId: chosen,
            policyTypeCode: state.values.policyTypeCode as PolicyTypeCode,
          });
          await goTo('review');
        } catch (error) {
          setServerError(error);
        }
      }),
    () => document.getElementById('vehicle-0')?.focus(),
  );

  const { errors, isSubmitting, submitCount } = formState;
  const list = vehicles.data ?? [];

  return (
    <div className="grid gap-10 xl:grid-cols-12">
      <div className="space-y-8 xl:col-span-7">
        <form
          noValidate
          aria-labelledby="wizard-step-title"
          onSubmit={(event) => void onSubmit(event)}
          className="space-y-6"
          id="vehicle-choice"
        >
          <FormErrorSummary
            errors={errors}
            fields={[{ name: 'vehicleId', id: 'vehicle-0', label: t('wizard.fields.vehicle') }]}
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

          <fieldset
            aria-describedby={errors.vehicleId ? 'vehicle-error' : undefined}
            className="space-y-3"
          >
            <legend className="mb-3 text-sm font-medium">{t('wizard.fields.vehicle')}</legend>
            {vehicles.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : vehicles.isError ? (
              <ErrorNotice error={vehicles.error} />
            ) : list.length === 0 ? (
              <p className="text-muted">{t('wizard.noVehicles')}</p>
            ) : (
              <div className="grid gap-3">
                {list.map((vehicle, index) => {
                  const checked = vehicleId === vehicle.id;
                  return (
                    <label
                      key={vehicle.id}
                      className={cx(
                        'flex cursor-pointer items-start gap-3 rounded-sm border p-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                        checked
                          ? 'border-accent bg-surface-2'
                          : 'border-line-strong hover:bg-surface-2',
                      )}
                    >
                      <input
                        type="radio"
                        id={`vehicle-${index}`}
                        value={vehicle.id}
                        className="mt-1 size-4 shrink-0 accent-accent"
                        {...register('vehicleId')}
                      />
                      <span className="mt-0.5 text-muted" aria-hidden="true">
                        <CarIcon />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {vehicle.plateNumber} · {vehicle.make} {vehicle.model}
                        </span>
                        <span className="block text-sm break-all text-muted tabular">
                          {vehicle.year} ·{' '}
                          {t('certificate.engineValue', {
                            cc: format.integer(vehicle.engineCapacityCc),
                          })}{' '}
                          · VIN {vehicle.vin}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {errors.vehicleId?.message && (
              <p id="vehicle-error" className="flex items-start gap-1.5 text-sm text-danger">
                <span className="mt-0.5 shrink-0">
                  <AlertIcon />
                </span>
                {t(errors.vehicleId.message)}
              </p>
            )}
          </fieldset>
        </form>

        {adding ? (
          <VehicleForm
            onCancel={() => setAdding(false)}
            onCreated={(vehicle) => {
              void queryClient.invalidateQueries({ queryKey: cabinetKeys.vehicles() });
              setValue('vehicleId', vehicle.id, { shouldValidate: true });
              setValues({ vehicleId: vehicle.id });
              setAdding(false);
            }}
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <PlusIcon />
            {t('vehicle.add')}
          </Button>
        )}

        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6">
          <Button variant="ghost" size="lg" onClick={() => void goTo('cover')}>
            {t('wizard.back')}
          </Button>
          <Button type="submit" form="vehicle-choice" size="lg" loading={isSubmitting}>
            {t('wizard.continue')}
          </Button>
        </div>
      </div>

      <aside
        aria-label={t('wizard.quote.label')}
        className="xl:sticky xl:top-24 xl:col-span-5 xl:self-start"
      >
        <QuotePanel values={liveValues} />
      </aside>
    </div>
  );
}
