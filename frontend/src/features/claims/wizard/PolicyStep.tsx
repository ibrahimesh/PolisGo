import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { PolicyResponse } from '../../../api/types';
import { ButtonLink } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { EmptyState } from '../../../components/ui/EmptyState';
import { FormErrorSummary } from '../../../components/ui/FormErrorSummary';
import { useFormatters } from '../../../i18n/format';
import { useProductName } from '../../policies/useProductName';
import { PolicyStatusBadge } from '../../policies/PolicyStatusBadge';
import { claimEligibility } from '../claimRules';
import type { Eligibility } from '../claimRules';
import { policyChoiceSchema } from '../claimSchemas';
import type { PolicyChoice } from '../claimSchemas';
import { useClaimWizard } from './ClaimWizardContext';
import { GroupError, StepFooter } from './stepParts';
import { useApplyServerErrors } from './useApplyServerErrors';

const optionId = (policyId: string) => `claim-policy-${policyId}`;

export function PolicyStep() {
  const { t } = useTranslation();
  const { state, policies, setValues, goTo } = useClaimWizard();

  // Policies that can take a claim first; the rest stay visible, disabled,
  // with the reason, so "where is my policy?" answers itself.
  const rows = policies
    .map((policy) => ({ policy, eligibility: claimEligibility(policy) }))
    .sort((a, b) => Number(b.eligibility.eligible) - Number(a.eligibility.eligible));
  const firstEnabled = rows.find((r) => r.eligibility.eligible)?.policy.id;

  const { register, control, handleSubmit, setError, formState } = useForm<PolicyChoice>({
    resolver: zodResolver(policyChoiceSchema),
    mode: 'onTouched',
    shouldFocusError: false,
    defaultValues: { policyId: state.values.policyId },
  });
  const focusFirst = () =>
    document.getElementById(optionId(state.values.policyId || firstEnabled || ''))?.focus();
  useApplyServerErrors<PolicyChoice>(['policyId'], setError, focusFirst);

  const policyId = useWatch({ control, name: 'policyId' });
  useEffect(() => {
    setValues({ policyId: policyId || '' });
    // setValues is stable in intent; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  if (policies.length === 0) {
    return (
      <EmptyState
        headingLevel="h3"
        title={t('claimWizard.policy.noneTitle')}
        body={t('claimWizard.policy.noneBody')}
        action={<ButtonLink to="/app/buy">{t('overview.buy')}</ButtonLink>}
      />
    );
  }

  const { errors, submitCount } = formState;
  const onSubmit = handleSubmit(
    () => goTo('incident'),
    () => focusFirst(),
  );

  return (
    <form
      noValidate
      aria-labelledby="claim-step-title"
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-8"
    >
      <FormErrorSummary
        errors={errors}
        fields={[
          {
            name: 'policyId',
            id: optionId(firstEnabled ?? ''),
            label: t('claimWizard.policy.legend'),
          },
        ]}
        show={submitCount > 0}
      />
      <fieldset
        aria-describedby={errors.policyId ? 'claim-policy-error' : 'claim-policy-hint'}
        className="space-y-3"
      >
        <legend className="mb-1 text-sm font-medium">{t('claimWizard.policy.legend')}</legend>
        <p id="claim-policy-hint" className="mb-3 text-sm text-muted">
          {firstEnabled ? t('claimWizard.policy.hint') : t('claimWizard.policy.noneEligible')}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(({ policy, eligibility }) => (
            <PolicyOption
              key={policy.id}
              policy={policy}
              eligibility={eligibility}
              checked={policyId === policy.id}
              inputProps={register('policyId')}
            />
          ))}
        </div>
        <GroupError id="claim-policy-error" message={errors.policyId?.message} />
      </fieldset>
      <StepFooter />
    </form>
  );
}

function PolicyOption({
  policy,
  eligibility,
  checked,
  inputProps,
}: {
  policy: PolicyResponse;
  eligibility: Eligibility;
  checked: boolean;
  inputProps: UseFormRegisterReturn<'policyId'>;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const reasonId = `${optionId(policy.id)}-reason`;
  const disabled = !eligibility.eligible;
  return (
    <label
      className={cx(
        'flex gap-3 rounded-sm border p-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
        disabled
          ? 'cursor-not-allowed border-line text-muted'
          : checked
            ? 'cursor-pointer border-accent bg-surface-2'
            : 'cursor-pointer border-line-strong hover:bg-surface-2',
      )}
    >
      <input
        type="radio"
        id={optionId(policy.id)}
        value={policy.id}
        disabled={disabled}
        aria-describedby={disabled ? reasonId : undefined}
        className="mt-1 size-4 shrink-0 accent-accent"
        {...inputProps}
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className={cx('font-medium', !disabled && 'text-text')}>
            {product.name(policy.policyTypeCode)} · {policy.vehicle.plateNumber}
          </span>
          <PolicyStatusBadge status={policy.status} />
        </span>
        <span className="block text-sm break-all text-muted">
          {policy.policyNumber} · {policy.vehicle.make} {policy.vehicle.model}
        </span>
        <span className="block text-sm text-muted tabular">
          {format.date(policy.startDate)} – {format.date(policy.endDate)}
        </span>
        {!eligibility.eligible && (
          <span id={reasonId} className="block text-sm text-text">
            {t(`claimWizard.policy.reasons.${eligibility.reason}`, {
              date: eligibility.date ? format.date(eligibility.date) : '',
            })}
          </span>
        )}
      </span>
    </label>
  );
}
