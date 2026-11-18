import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { claimsApi } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { useToast } from '../../components/ui/ToastProvider';
import { useExclusive } from '../../lib/hooks';
import { applyServerFieldErrors } from '../auth/applyServerErrors';
import { useInvalidateCabinet } from '../cabinet/queries';
import { CLAIM_RULES } from './claimRules';
import { withdrawSchema } from './claimSchemas';
import type { WithdrawValues } from './claimSchemas';

// Withdrawing is final, so it asks first; the reason is optional and goes
// into the claim's history for the adjuster to read.
export function WithdrawDialog({
  open,
  onClose,
  claimId,
  claimNumber,
}: {
  open: boolean;
  onClose: () => void;
  claimId: string;
  claimNumber: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const invalidate = useInvalidateCabinet();
  const exclusive = useExclusive();
  const [serverError, setServerError] = useState<unknown>(null);
  const { register, control, handleSubmit, setError, formState, reset } = useForm<WithdrawValues>({
    resolver: zodResolver(withdrawSchema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });
  const reason = useWatch({ control, name: 'reason' });
  const { errors, isSubmitting } = formState;

  const close = () => {
    if (isSubmitting) return;
    reset();
    setServerError(null);
    onClose();
  };

  const onSubmit = handleSubmit((values) =>
    exclusive(async () => {
      setServerError(null);
      try {
        await claimsApi.withdraw(claimId, { reason: values.reason.trim() || null });
        toast({ tone: 'success', title: t('claimDetail.withdrawn', { number: claimNumber }) });
        await invalidate();
        reset();
        onClose();
      } catch (error) {
        if (applyServerFieldErrors(error, ['reason'], setError).length === 0) setServerError(error);
      }
    }),
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('claimDetail.withdrawTitle', { number: claimNumber })}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={isSubmitting}>
            {t('claimDetail.keep')}
          </Button>
          <Button type="submit" form="withdraw-form" loading={isSubmitting}>
            {t('claimDetail.confirmWithdraw')}
          </Button>
        </>
      }
    >
      <form id="withdraw-form" noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <p>{t('claimDetail.withdrawBody')}</p>
        {serverError !== null && (
          <ErrorNotice error={serverError} overrides={{ 409: 'claimDetail.withdrawConflict' }} />
        )}
        <Textarea
          id="withdraw-reason"
          label={t('claimDetail.reasonLabel')}
          rows={3}
          count={{ value: reason.trim().length, max: CLAIM_RULES.maxReason }}
          error={errors.reason?.message}
          {...register('reason')}
        />
      </form>
    </Modal>
  );
}
