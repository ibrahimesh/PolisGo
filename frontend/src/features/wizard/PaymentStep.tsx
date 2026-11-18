import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { policiesApi } from '../../api/endpoints';
import { isApiError } from '../../api/errors';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { serverMessageKey } from '../../i18n/apiErrors';
import { useFormatters } from '../../i18n/format';
import { endDateFor } from '../policies/policyDates';
import { useInvalidateCabinet } from '../cabinet/queries';
import { useWizard } from './WizardContext';

// Pays the draft through the API's payment gateway — a fake in this build that
// always succeeds. No card form is shown, because nothing would be done with
// one; the page says so instead of pretending.
export function PaymentStep() {
  const { t } = useTranslation();
  const format = useFormatters();
  const invalidate = useInvalidateCabinet();
  const { state, goTo, complete, reset } = useWizard();
  const draft = state.draft;
  // Guards the gap between the click and the disabled re-render.
  const inFlight = useRef(false);

  const pay = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await policiesApi.pay(id);
      } catch (error) {
        // A 409 can mean an earlier attempt (another tab, a lost response)
        // already paid it. Check before calling it a failure.
        if (isApiError(error) && error.status === 409) {
          const detail = await policiesApi.get(id);
          const paid = detail.payments.find((p) => p.status === 'Completed');
          if (detail.policy.status === 'Active' && paid) {
            return {
              reference: paid.reference ?? '—',
              paidAt: paid.paidAt,
              amount: paid.amount,
              currency: paid.currency,
            };
          }
        }
        throw error;
      }
    },
    onSuccess: (receipt) => {
      void invalidate();
      complete({
        reference: receipt.reference,
        paidAt: receipt.paidAt,
        amount: receipt.amount,
        currency: receipt.currency,
      });
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  if (!draft) return null;
  const startPassed =
    isApiError(pay.error) &&
    serverMessageKey(pay.error.problem?.detail) === 'errors.draftStartPassed';

  return (
    <div className="grid gap-10 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-7">
        <Card variant="paper" className="space-y-6 p-6 sm:p-8">
          <div>
            <p className="text-sm font-medium text-paper-muted">{t('wizard.payment.amount')}</p>
            <p className="font-serif text-2xl tabular sm:text-3xl">
              {format.money(draft.premium, draft.currency)}
            </p>
          </div>
          <dl className="divide-y divide-paper-line border-t border-paper-line">
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="text-sm font-medium text-paper-muted">{t('policy.number')}</dt>
              <dd className="break-all tabular">{draft.policyNumber}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="text-sm font-medium text-paper-muted">{t('policy.period')}</dt>
              <dd className="tabular">
                {t('policy.periodValue', {
                  from: format.date(state.values.startDate),
                  to: format.date(endDateFor(state.values.startDate, state.values.termMonths)),
                })}
              </dd>
            </div>
          </dl>
        </Card>

        <p className="text-sm text-muted">{t('wizard.payment.demo')}</p>

        {pay.isError && (
          <ErrorNotice
            error={pay.error}
            action={
              startPassed ? (
                <Button variant="secondary" size="sm" onClick={reset}>
                  {t('wizard.startFresh')}
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6">
          <Button
            variant="ghost"
            size="lg"
            disabled={pay.isPending}
            onClick={() => void goTo('review')}
          >
            {t('wizard.back')}
          </Button>
          <Button
            size="lg"
            loading={pay.isPending}
            disabled={startPassed}
            onClick={() => {
              if (inFlight.current) return;
              inFlight.current = true;
              pay.mutate(draft.id);
            }}
          >
            {t('wizard.payment.pay', { amount: format.money(draft.premium, draft.currency) })}
          </Button>
        </div>
      </div>
    </div>
  );
}
