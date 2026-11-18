import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { claimsApi } from '../../../api/endpoints';
import { isApiError } from '../../../api/errors';
import type { IncidentType } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../../components/ui/FormErrorSummary';
import { fieldMessageKey } from '../../../i18n/apiErrors';
import { useFormatters } from '../../../i18n/format';
import { useExclusive } from '../../../lib/hooks';
import { useInvalidateCabinet } from '../../cabinet/queries';
import { useProductName } from '../../policies/useProductName';
import { CLAIM_RULES } from '../claimRules';
import { claimReviewSchema, parseAmount } from '../claimSchemas';
import type { ClaimReviewValues } from '../claimSchemas';
import { clearPendingFiles } from '../upload/pendingFiles';
import { FileUploader } from '../upload/FileUploader';
import { useClaimWizard } from './ClaimWizardContext';
import { CLAIM_STEPS, FIELD_STEP } from './claimWizardState';
import type { ClaimStep } from './claimWizardState';
import { GroupError } from './stepParts';
import { useAuth } from '../../../auth/AuthContext';

export function ReviewStep() {
  const { t } = useTranslation();
  const format = useFormatters();
  const product = useProductName();
  const { user } = useAuth();
  const invalidate = useInvalidateCabinet();
  const exclusive = useExclusive();
  const { state, selectedPolicy, files, goTo, setClaim, setServerErrors } = useClaimWizard();
  const { values, claim } = state;
  const [serverError, setServerError] = useState<unknown>(null);
  const [failedUploads, setFailedUploads] = useState(0);
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, formState } = useForm<ClaimReviewValues>({
    resolver: zodResolver(claimReviewSchema),
    mode: 'onTouched',
    // Once filed, the declaration was given.
    defaultValues: { accept: claim !== null },
  });
  const { errors, isSubmitting, submitCount } = formState;

  const finish = async (claimId: string) => {
    setUploading(true);
    const { failed } = await files.upload(claimId);
    setUploading(false);
    void invalidate();
    setFailedUploads(failed);
    if (failed === 0) {
      if (user) await clearPendingFiles(`claim.${user.id}`);
      goTo('done');
    }
  };

  const onSubmit = handleSubmit(
    () =>
      exclusive(async () => {
        setServerError(null);
        let filed = claim;
        if (!filed) {
          try {
            const created = await claimsApi.submit({
              policyId: values.policyId,
              incidentDate: values.incidentDate,
              incidentType: values.incidentType as IncidentType,
              location: values.location.trim(),
              description: values.description.trim(),
              claimedAmount: parseAmount(values.claimedAmount),
            });
            filed = { id: created.id, claimNumber: created.claimNumber };
            setClaim(filed);
            void invalidate();
          } catch (error) {
            // A 400 goes back to the step that owns the first bad field.
            if (isApiError(error) && error.status === 400) {
              const mapped: Record<string, string> = {};
              for (const [field, messages] of Object.entries(error.fieldErrors))
                if (FIELD_STEP[field]) mapped[field] = fieldMessageKey(messages);
              const steps = Object.keys(mapped).map((field) => FIELD_STEP[field] as ClaimStep);
              const first = CLAIM_STEPS.find((step) => steps.includes(step));
              if (first) {
                setServerErrors(mapped);
                goTo(first);
                return;
              }
            }
            setServerError(error);
            return;
          }
        }
        await finish(filed.id);
      }),
    () => document.getElementById('claim-review-accept')?.focus(),
  );

  const edit = claim ? undefined : (step: ClaimStep) => () => goTo(step);
  const showQueue = claim !== null || uploading;

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
          { name: 'accept', id: 'claim-review-accept', label: t('claimWizard.review.acceptLabel') },
        ]}
        show={submitCount > 0}
      />
      {serverError !== null && (
        <ErrorNotice
          error={serverError}
          overrides={{
            409: 'errors.claimDuplicate',
            404: 'claimWizard.review.policyGone',
          }}
        />
      )}
      {claim && failedUploads > 0 && !uploading && (
        <div role="alert" className="space-y-3 rounded-sm border border-warning/60 p-4">
          <p className="font-medium">
            {t('claimWizard.review.filedWithFailures', {
              number: claim.claimNumber,
              count: failedUploads,
            })}
          </p>
          <p className="text-sm text-muted">{t('claimWizard.review.failuresHelp')}</p>
          <Button variant="secondary" size="sm" onClick={() => goTo('done')}>
            {t('claimWizard.review.continueWithout')}
          </Button>
        </div>
      )}

      <dl className="divide-y divide-line border-y border-line">
        <Row label={t('claimWizard.steps.policy.short')} onEdit={edit?.('policy')}>
          {selectedPolicy ? (
            <>
              {product.name(selectedPolicy.policyTypeCode)} · {selectedPolicy.vehicle.plateNumber}
              <span className="block text-sm break-all text-muted">
                {selectedPolicy.policyNumber}
              </span>
            </>
          ) : (
            '—'
          )}
        </Row>
        <Row label={t('claimWizard.incident.date')} onEdit={edit?.('incident')}>
          {values.incidentDate ? format.date(values.incidentDate) : '—'}
          {values.incidentType && (
            <span className="block text-sm text-muted">
              {t(`incidentType.${values.incidentType}`)}
            </span>
          )}
        </Row>
        <Row label={t('claimWizard.incident.location')} onEdit={edit?.('incident')}>
          <span className="break-words">{values.location}</span>
        </Row>
        <Row label={t('claimWizard.incident.description')} onEdit={edit?.('incident')}>
          <span className="block break-words whitespace-pre-line">{values.description}</span>
        </Row>
        <Row label={t('claimWizard.damage.amount')} onEdit={edit?.('damage')}>
          <span className="tabular">{format.money(parseAmount(values.claimedAmount))}</span>
        </Row>
        <Row label={t('claimWizard.steps.documents.short')} onEdit={edit?.('documents')}>
          {files.items.length === 0
            ? t('claimWizard.review.noDocuments')
            : t('claimWizard.review.documents', { count: files.items.length })}
        </Row>
      </dl>

      {showQueue && files.items.length > 0 && (
        <FileUploader
          queue={files}
          remaining={CLAIM_RULES.maxDocuments - files.items.length}
          disabled={uploading}
          label={t('upload.dropLabel')}
        />
      )}

      {!claim && (
        <div className="space-y-2">
          <label htmlFor="claim-review-accept" className="flex cursor-pointer items-start gap-3">
            <input
              id="claim-review-accept"
              type="checkbox"
              aria-invalid={errors.accept ? true : undefined}
              aria-describedby={errors.accept ? 'claim-review-accept-error' : undefined}
              className="mt-1 size-4 shrink-0 accent-accent"
              {...register('accept')}
            />
            <span>{t('claimWizard.review.accept')}</span>
          </label>
          <GroupError id="claim-review-accept-error" message={errors.accept?.message} />
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6">
        {claim ? (
          <span />
        ) : (
          <Button variant="ghost" size="lg" onClick={() => goTo('documents')}>
            {t('wizard.back')}
          </Button>
        )}
        <Button type="submit" size="lg" loading={isSubmitting || uploading}>
          {claim ? t('claimWizard.review.retryUploads') : t('claimWizard.review.submit')}
        </Button>
      </div>
    </form>
  );
}

function Row({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: (() => void) | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-start sm:gap-6">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
      {onEdit && (
        <dd>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            {t('wizard.review.edit')}
            <span className="sr-only"> — {label}</span>
          </Button>
        </dd>
      )}
    </div>
  );
}
