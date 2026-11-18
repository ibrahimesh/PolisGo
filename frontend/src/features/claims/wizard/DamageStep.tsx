import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormErrorSummary } from '../../../components/ui/FormErrorSummary';
import { Input } from '../../../components/ui/Input';
import { useFormatters } from '../../../i18n/format';
import { CLAIM_RULES } from '../claimRules';
import { damageSchema } from '../claimSchemas';
import type { DamageValues } from '../claimSchemas';
import { useClaimWizard } from './ClaimWizardContext';
import { StepFooter } from './stepParts';
import { useApplyServerErrors } from './useApplyServerErrors';

export function DamageStep() {
  const { t } = useTranslation();
  const format = useFormatters();
  const { state, selectedPolicy, setValues, goTo } = useClaimWizard();

  const { register, control, handleSubmit, setError, setFocus, formState } = useForm<DamageValues>({
    resolver: zodResolver(damageSchema),
    mode: 'onTouched',
    defaultValues: { claimedAmount: state.values.claimedAmount },
  });
  useApplyServerErrors<DamageValues>(['claimedAmount'], setError, (field) => setFocus(field));

  const amount = useWatch({ control, name: 'claimedAmount' });
  useEffect(() => {
    setValues({ claimedAmount: amount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const { errors, submitCount } = formState;
  const onSubmit = handleSubmit(() => goTo('documents'));
  const code = selectedPolicy?.policyTypeCode;

  return (
    <form
      noValidate
      aria-labelledby="claim-step-title"
      onSubmit={(e) => void onSubmit(e)}
      className="max-w-3xl space-y-8"
    >
      <FormErrorSummary
        errors={errors}
        fields={[
          {
            name: 'claimedAmount',
            id: 'claim-claimedAmount',
            label: t('claimWizard.damage.amount'),
          },
        ]}
        show={submitCount > 0}
      />
      <div className="max-w-sm">
        <Input
          id="claim-claimedAmount"
          label={t('claimWizard.damage.amount')}
          inputMode="decimal"
          autoComplete="off"
          suffix="AZN"
          hint={t('claimWizard.damage.amountHint', {
            max: format.money(CLAIM_RULES.maxAmount),
          })}
          error={errors.claimedAmount?.message}
          {...register('claimedAmount')}
        />
      </div>
      <div className="space-y-3 border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-muted">
        <p>{t('claimWizard.damage.estimate')}</p>
        {code && (
          <p>
            {t(`claimWizard.damage.cover.${code}`, {
              defaultValue: t('claimWizard.damage.cover.other'),
            })}
          </p>
        )}
        <p>{t('claimWizard.damage.review')}</p>
      </div>
      <StepFooter back="incident" />
    </form>
  );
}
