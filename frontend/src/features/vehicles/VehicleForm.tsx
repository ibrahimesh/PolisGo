import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useExclusive } from '../../lib/hooks';
import { vehiclesApi } from '../../api/endpoints';
import { isApiError } from '../../api/errors';
import type { Guid, VehicleResponse } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../components/ui/FormErrorSummary';
import type { SummaryField } from '../../components/ui/FormErrorSummary';
import { Input } from '../../components/ui/Input';
import { applyServerFieldErrors } from '../auth/applyServerErrors';
import { createVehicleSchema, MAKE_MAX, MODEL_MAX, PLATE_MAX } from './vehicleSchema';
import type { VehicleInput, VehicleValues } from './vehicleSchema';

const FIELDS = ['make', 'model', 'year', 'engineCapacityCc', 'plateNumber', 'vin'] as const;
const id = (field: (typeof FIELDS)[number]) => `vehicle-${field}`;

// Registers a vehicle: for the signed-in client (the API takes the customer
// from the token) in the purchase wizard, or, with customerId, for an agent's
// customer when selling on their behalf.
export function VehicleForm({
  onCreated,
  onCancel,
  customerId,
}: {
  onCreated: (vehicle: VehicleResponse) => void;
  onCancel?: () => void;
  customerId?: Guid;
}) {
  const { t } = useTranslation();
  const schema = useMemo(() => createVehicleSchema(), []);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const exclusive = useExclusive();

  const { register, handleSubmit, setError, setFocus, formState } = useForm<
    VehicleInput,
    unknown,
    VehicleValues
  >({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      make: '',
      model: '',
      year: '',
      engineCapacityCc: '',
      plateNumber: '',
      vin: '',
    },
  });

  const labels: Record<(typeof FIELDS)[number], string> = {
    make: t('vehicle.make'),
    model: t('vehicle.model'),
    year: t('vehicle.year'),
    engineCapacityCc: t('vehicle.engine'),
    plateNumber: t('vehicle.plate'),
    vin: t('vehicle.vin'),
  };
  const summary: SummaryField<VehicleInput>[] = FIELDS.map((name) => ({
    name,
    id: id(name),
    label: labels[name],
  }));

  const onSubmit = handleSubmit((values) =>
    exclusive(async () => {
      setSubmitError(null);
      try {
        onCreated(await vehiclesApi.create({ ...values, customerId }));
      } catch (error) {
        // A taken plate is a 409, but it belongs to one field.
        if (isApiError(error) && error.status === 409) {
          setError('plateNumber', { type: 'server', message: 'errors.plateTaken' });
          setFocus('plateNumber');
        } else {
          const matched = applyServerFieldErrors(error, FIELDS, setError);
          if (matched[0]) setFocus(matched[0]);
          else setSubmitError(error);
        }
      }
    }),
  );

  const { errors, isSubmitting, submitCount } = formState;

  return (
    <form
      noValidate
      aria-labelledby="vehicle-form-title"
      onSubmit={(event) => void onSubmit(event)}
      className="space-y-6 rounded-sm border border-line p-4 sm:p-6"
    >
      <h3 id="vehicle-form-title" className="text-lg">
        {t('vehicle.addTitle')}
      </h3>
      <FormErrorSummary errors={errors} fields={summary} show={submitCount > 0} />
      {submitError !== null && <ErrorNotice error={submitError} />}
      <div className="grid gap-6 sm:grid-cols-2">
        <Input
          id={id('make')}
          label={labels.make}
          maxLength={MAKE_MAX}
          autoComplete="off"
          error={errors.make?.message}
          {...register('make')}
        />
        <Input
          id={id('model')}
          label={labels.model}
          maxLength={MODEL_MAX}
          autoComplete="off"
          error={errors.model?.message}
          {...register('model')}
        />
        <Input
          id={id('year')}
          label={labels.year}
          inputMode="numeric"
          error={errors.year?.message}
          {...register('year')}
        />
        <Input
          id={id('engineCapacityCc')}
          label={labels.engineCapacityCc}
          inputMode="numeric"
          suffix={t('calculator.engineUnit')}
          error={errors.engineCapacityCc?.message}
          {...register('engineCapacityCc')}
        />
        <Input
          id={id('plateNumber')}
          label={labels.plateNumber}
          hint={t('vehicle.plateHint')}
          maxLength={PLATE_MAX}
          autoComplete="off"
          autoCapitalize="characters"
          error={errors.plateNumber?.message}
          {...register('plateNumber')}
        />
        <Input
          id={id('vin')}
          label={labels.vin}
          hint={t('vehicle.vinHint')}
          maxLength={17}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          error={errors.vin?.message}
          {...register('vin')}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={isSubmitting}>
          {t('vehicle.save')}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('vehicle.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
