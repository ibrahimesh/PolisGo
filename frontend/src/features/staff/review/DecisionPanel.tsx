import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { claimsApi } from '../../../api/endpoints';
import type { ClaimAction, ClaimActionState, ClaimDetailResponse } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cx } from '../../../components/ui/cx';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { FormErrorSummary } from '../../../components/ui/FormErrorSummary';
import type { SummaryField } from '../../../components/ui/FormErrorSummary';
import { AlertIcon } from '../../../components/ui/icons';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import { useFormatters } from '../../../i18n/format';
import { firstFieldMessageKey } from '../../../i18n/apiErrors';
import { useExclusive } from '../../../lib/hooks';
import { applyServerFieldErrors } from '../../auth/applyServerErrors';
import {
  createDecisionSchema,
  DECISION_OUTCOMES,
  DECISION_RULES,
  isConcurrencyConflict,
  parseDecisionAmount,
} from './decisionSchema';
import type { DecisionDraft, DecisionInput, DecisionValues } from './decisionSchema';

interface DecisionPanelProps {
  detail: ClaimDetailResponse;
  draft: DecisionDraft;
  onDraftChange: (draft: DecisionDraft) => void;
  // Reloads the claim; resolves once the latest version is on screen.
  reload: () => Promise<unknown>;
  // Called after a successful action, to clear the draft and refresh lists.
  onDone: () => Promise<unknown>;
}

const FIELDS = ['outcome', 'approvedAmount', 'comment'] as const;
const fieldId = (name: (typeof FIELDS)[number]) =>
  name === 'outcome' ? 'decision-outcome-approve' : `decision-${name}`;

// What the reviewer can do now, driven by the server's list of actions:
// each allowed one gets its control, each blocked one its reason in words.
export function DecisionPanel({
  detail,
  draft,
  onDraftChange,
  reload,
  onDone,
}: DecisionPanelProps) {
  const { t } = useTranslation();
  const format = useFormatters();
  const toast = useToast();
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const allowed = (action: ClaimAction) =>
    detail.actions.some((a) => a.action === action && a.allowed);
  const blocked = detail.actions.filter((a) => !a.allowed);
  const canDecide = allowed('Approve') || allowed('Reject');

  // Every action funnels through here: a stale version reloads the claim and
  // keeps the draft; anything else is shown as it is.
  const handleError = async (caught: unknown) => {
    if (isConcurrencyConflict(caught)) {
      setError(null);
      setConflict(true);
      await reload();
    } else {
      setError(caught);
    }
    noticeRef.current?.focus();
  };

  const run = async (task: () => Promise<unknown>, success?: string) => {
    setError(null);
    setConflict(false);
    await task();
    if (success) toast.toast({ tone: 'success', title: success });
    await onDone();
  };

  return (
    <Card as="section" aria-labelledby="decision-title" className="space-y-6 p-6 sm:p-8">
      <h2 id="decision-title" className="text-2xl">
        {t('staff.review.decision.title')}
      </h2>

      <div ref={noticeRef} tabIndex={-1} className="space-y-4 outline-none">
        {conflict && <ConflictNotice draft={draft} stillEditable={canDecide} />}
        {error !== null && (
          <ErrorNotice error={error} overrides={{ 400: firstFieldMessageKey(error) }} />
        )}
      </div>

      {allowed('Review') && (
        <SimpleAction
          description={t('staff.review.decision.reviewHelp')}
          label={t('staff.review.decision.startReview')}
          onRun={() =>
            run(
              () => claimsApi.review(detail.claim.id, { rowVersion: detail.claim.rowVersion }),
              t('staff.review.decision.reviewToast'),
            ).then(() => undefined, handleError)
          }
        />
      )}

      {canDecide && (
        <DecisionForm
          detail={detail}
          draft={draft}
          onDraftChange={onDraftChange}
          onSubmit={(values) =>
            run(() =>
              values.outcome === 'approve'
                ? claimsApi.approve(detail.claim.id, {
                    approvedAmount: parseDecisionAmount(values.approvedAmount),
                    comment: values.comment.trim() || null,
                    rowVersion: detail.claim.rowVersion,
                  })
                : claimsApi.reject(detail.claim.id, {
                    comment: values.comment.trim(),
                    rowVersion: detail.claim.rowVersion,
                  }),
            )
          }
          onError={handleError}
        />
      )}

      {allowed('Pay') && (
        <SimpleAction
          description={t('staff.review.decision.payHelp', {
            amount: format.money(detail.claim.approvedAmount ?? 0),
          })}
          label={t('staff.review.decision.pay', {
            amount: format.money(detail.claim.approvedAmount ?? 0),
          })}
          onRun={() =>
            run(
              () => claimsApi.pay(detail.claim.id, { rowVersion: detail.claim.rowVersion }),
              t('staff.review.decision.paidToast'),
            ).then(() => undefined, handleError)
          }
        />
      )}

      {blocked.length > 0 && <Unavailable actions={blocked} />}
    </Card>
  );
}

function ConflictNotice({
  draft,
  stillEditable,
}: {
  draft: DecisionDraft;
  stillEditable: boolean;
}) {
  const { t } = useTranslation();
  const kept = draft.comment.trim();
  return (
    <div role="alert" className="space-y-3 rounded-sm border border-warning/60 p-4">
      <p className="flex items-start gap-2 font-medium">
        <span className="mt-0.5 shrink-0 text-warning">
          <AlertIcon />
        </span>
        {t('staff.review.conflict.title')}
      </p>
      <p className="text-muted">
        {stillEditable
          ? t('staff.review.conflict.bodyEditable')
          : t('staff.review.conflict.bodyClosed')}
      </p>
      {/* The form is gone when the claim moved on: the note is kept here to copy. */}
      {!stillEditable && kept && (
        <Textarea label={t('staff.review.conflict.keptNote')} value={kept} readOnly rows={3} />
      )}
    </div>
  );
}

function SimpleAction({
  description,
  label,
  onRun,
}: {
  description: string;
  label: string;
  onRun: () => Promise<void>;
}) {
  const exclusive = useExclusive();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <p className="text-muted">{description}</p>
      <Button
        loading={busy}
        onClick={() =>
          void exclusive(async () => {
            setBusy(true);
            try {
              await onRun();
            } finally {
              setBusy(false);
            }
          })
        }
      >
        {label}
      </Button>
    </div>
  );
}

function DecisionForm({
  detail,
  draft,
  onDraftChange,
  onSubmit,
  onError,
}: {
  detail: ClaimDetailResponse;
  draft: DecisionDraft;
  onDraftChange: (draft: DecisionDraft) => void;
  onSubmit: (values: DecisionValues) => Promise<void>;
  onError: (error: unknown) => Promise<void>;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const toast = useToast();
  const exclusive = useExclusive();
  const claimed = detail.claim.claimedAmount;
  const schema = useMemo(() => createDecisionSchema(claimed), [claimed]);
  const actionAllowed = (action: ClaimAction) =>
    detail.actions.some((a) => a.action === action && a.allowed);

  const { register, control, handleSubmit, setError, setFocus, formState } = useForm<
    DecisionInput,
    unknown,
    DecisionValues
  >({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    // Radios can't take RHF's focus; the invalid handler focuses in field order.
    shouldFocusError: false,
    defaultValues: draft,
  });

  const watched = useWatch({ control });
  useEffect(() => {
    onDraftChange({
      outcome: watched.outcome ?? null,
      approvedAmount: watched.approvedAmount ?? '',
      comment: watched.comment ?? '',
    });
    // The parent setter is stable in intent; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched.outcome, watched.approvedAmount, watched.comment]);

  const outcome = watched.outcome ?? null;
  const labels = {
    outcome: t('staff.review.decision.outcome'),
    approvedAmount: t('staff.review.decision.approvedAmount'),
    comment:
      outcome === 'reject' ? t('staff.review.decision.reason') : t('staff.review.decision.note'),
  };
  const summary: SummaryField<DecisionInput>[] = FIELDS.map((name) => ({
    name,
    id: fieldId(name),
    label: labels[name],
  }));

  const submit = handleSubmit(
    (values) =>
      exclusive(async () => {
        try {
          await onSubmit(values);
          toast.toast({
            tone: 'success',
            title:
              values.outcome === 'approve'
                ? t('staff.review.decision.approvedToast', {
                    amount: format.money(parseDecisionAmount(values.approvedAmount)),
                  })
                : t('staff.review.decision.rejectedToast'),
          });
        } catch (caught) {
          const matched = applyServerFieldErrors(caught, ['approvedAmount', 'comment'], setError);
          if (matched[0]) setFocus(matched[0]);
          else await onError(caught);
        }
      }),
    (invalid) => {
      const first = FIELDS.find((field) => invalid[field]);
      if (first) document.getElementById(fieldId(first))?.focus();
    },
  );

  const { errors, isSubmitting, submitCount } = formState;
  const comment = watched.comment ?? '';

  return (
    <form
      noValidate
      aria-labelledby="decision-title"
      onSubmit={(event) => void submit(event)}
      className="space-y-6 border-t border-line pt-6 first:border-t-0 first:pt-0"
    >
      <FormErrorSummary errors={errors} fields={summary} show={submitCount > 0} />

      <fieldset
        aria-describedby={errors.outcome ? 'decision-outcome-error' : undefined}
        className="space-y-3"
      >
        <legend className="mb-3 text-sm font-medium">{labels.outcome}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {DECISION_OUTCOMES.map((value) => {
            const enabled = actionAllowed(value === 'approve' ? 'Approve' : 'Reject');
            return (
              <label
                key={value}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-sm border p-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                  outcome === value
                    ? 'border-accent bg-surface-2'
                    : 'border-line-strong hover:bg-surface-2',
                  !enabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  id={`decision-outcome-${value}`}
                  value={value}
                  disabled={!enabled}
                  className="size-4 shrink-0 accent-accent"
                  {...register('outcome')}
                />
                <span className="font-medium">{t(`staff.review.decision.${value}`)}</span>
              </label>
            );
          })}
        </div>
        {errors.outcome?.message && (
          <p id="decision-outcome-error" className="flex items-start gap-1.5 text-sm text-danger">
            <span className="mt-0.5 shrink-0">
              <AlertIcon />
            </span>
            {t(errors.outcome.message)}
          </p>
        )}
      </fieldset>

      {outcome === 'approve' && (
        <Input
          id={fieldId('approvedAmount')}
          label={labels.approvedAmount}
          inputMode="decimal"
          autoComplete="off"
          hint={t('staff.review.decision.amountHint', { amount: format.money(claimed) })}
          error={errors.approvedAmount?.message}
          trailing={<span className="px-3 text-muted">AZN</span>}
          {...register('approvedAmount')}
        />
      )}

      <Textarea
        id={fieldId('comment')}
        label={labels.comment}
        hint={
          outcome === 'reject'
            ? t('staff.review.decision.reasonHint')
            : t('staff.review.decision.noteHint')
        }
        rows={4}
        count={{ value: comment.length, max: DECISION_RULES.maxComment }}
        error={errors.comment?.message}
        {...register('comment')}
      />

      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <Button type="submit" loading={isSubmitting}>
          {outcome === 'reject'
            ? t('staff.review.decision.submitReject')
            : outcome === 'approve'
              ? t('staff.review.decision.submitApprove')
              : t('staff.review.decision.submit')}
        </Button>
      </div>
    </form>
  );
}

function Unavailable({ actions }: { actions: readonly ClaimActionState[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-medium">{t('staff.review.unavailable.title')}</h3>
      <dl className="space-y-3">
        {actions.map((action) => (
          <div key={action.action} className="grid gap-1">
            <dt className="font-medium">{t(`staff.review.actions.${action.action}`)}</dt>
            <dd className="text-sm text-muted">
              {t(`staff.review.unavailable.${action.blockedReason ?? 'AlreadyDecided'}`)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
