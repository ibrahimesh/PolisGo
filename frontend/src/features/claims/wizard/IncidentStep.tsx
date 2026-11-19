import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { INCIDENT_TYPES } from '../../../api/types';
import { FormErrorSummary } from '../../../components/ui/FormErrorSummary';
import type { SummaryField } from '../../../components/ui/FormErrorSummary';
import { todayIso } from '../../../lib/dates';
import { FormDateField } from '../../../components/ui/FormDateField';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { useFormatters } from '../../../i18n/format';
import { CLAIM_RULES, incidentDateBounds } from '../claimRules';
import { createIncidentSchema } from '../claimSchemas';
import type { IncidentInput, IncidentValues } from '../claimSchemas';
import { useClaimWizard } from './ClaimWizardContext';
import { StepFooter } from './stepParts';
import { useApplyServerErrors } from './useApplyServerErrors';

const FIELDS = ['incidentDate', 'incidentType', 'location', 'description'] as const;
const id = (field: (typeof FIELDS)[number]) => `claim-${field}`;

export function IncidentStep() {
  const { t } = useTranslation();
  const format = useFormatters();
  const { state, selectedPolicy, setValues, goTo } = useClaimWizard();

  // The policy chosen on step 1 sets the window the incident must fall in.
  const bounds = useMemo(
    () => incidentDateBounds(selectedPolicy ?? { startDate: '0001-01-01', endDate: '9999-12-31' }),
    [selectedPolicy],
  );
  const schema = useMemo(() => createIncidentSchema(bounds), [bounds]);

  const { register, control, handleSubmit, setError, setFocus, formState } = useForm<
    IncidentInput,
    unknown,
    IncidentValues
  >({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      incidentDate: state.values.incidentDate,
      incidentType: state.values.incidentType as IncidentInput['incidentType'],
      location: state.values.location,
      description: state.values.description,
    },
  });
  useApplyServerErrors<IncidentInput>(FIELDS, setError, (field) => setFocus(field));

  // Saved as typed, so a reload keeps it.
  const watched = useWatch({ control });
  useEffect(() => {
    setValues({
      incidentDate: watched.incidentDate ?? '',
      incidentType: watched.incidentType ?? '',
      location: watched.location ?? '',
      description: watched.description ?? '',
    });
    // setValues is stable in intent; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched.incidentDate, watched.incidentType, watched.location, watched.description]);

  // Without a policy (it disappeared, or the state was tampered with) the
  // dates can't be checked: back to step 1.
  useEffect(() => {
    if (!selectedPolicy) goTo('policy');
  }, [selectedPolicy, goTo]);

  const labels = {
    incidentDate: t('claimWizard.incident.date'),
    incidentType: t('claimWizard.incident.type'),
    location: t('claimWizard.incident.location'),
    description: t('claimWizard.incident.description'),
  };
  const summary: SummaryField<IncidentInput>[] = FIELDS.map((name) => ({
    name,
    id: id(name),
    label: labels[name],
  }));
  const { errors, submitCount } = formState;
  const onSubmit = handleSubmit(() => goTo('damage'));

  return (
    <form
      noValidate
      aria-labelledby="claim-step-title"
      onSubmit={(e) => void onSubmit(e)}
      className="max-w-3xl space-y-8"
    >
      <FormErrorSummary errors={errors} fields={summary} show={submitCount > 0} />
      <div className="grid gap-6 sm:grid-cols-2">
        <FormDateField
          id={id('incidentDate')}
          control={control}
          name="incidentDate"
          label={labels.incidentDate}
          min={bounds.min}
          max={bounds.max}
          // Why only these days: the cover period, and nothing in the future.
          hint={
            selectedPolicy
              ? t('claimWizard.incident.dateHint', {
                  from: format.date(bounds.min),
                  to:
                    bounds.max === todayIso() ? t('dateField.todayWord') : format.date(bounds.max),
                })
              : undefined
          }
          error={errors.incidentDate?.message}
        />
        <Select
          id={id('incidentType')}
          label={labels.incidentType}
          error={errors.incidentType?.message}
          options={[
            { value: '', label: t('claimWizard.incident.typePlaceholder') },
            ...INCIDENT_TYPES.map((type) => ({ value: type, label: t(`incidentType.${type}`) })),
          ]}
          {...register('incidentType')}
        />
      </div>
      <Input
        id={id('location')}
        label={labels.location}
        autoComplete="off"
        maxLength={CLAIM_RULES.maxLocation}
        hint={t('claimWizard.incident.locationHint')}
        error={errors.location?.message}
        {...register('location')}
      />
      <Textarea
        id={id('description')}
        label={labels.description}
        rows={6}
        hint={t('claimWizard.incident.descriptionHint', { min: CLAIM_RULES.minDescription })}
        count={{
          value: (watched.description ?? '').trim().length,
          max: CLAIM_RULES.maxDescription,
        }}
        error={errors.description?.message}
        {...register('description')}
      />
      <StepFooter back="policy" />
    </form>
  );
}
