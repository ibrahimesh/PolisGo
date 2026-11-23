import { useTranslation } from 'react-i18next';
import { SuccessCheck } from '../../motion/SuccessCheck';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFormatters } from '../../i18n/format';
import { usePolicy } from '../cabinet/queries';
import { CertificateButton } from '../certificate/CertificateButton';
import { endDateFor } from '../policies/policyDates';
import { useWizard } from './WizardContext';

export function DoneStep() {
  const { t } = useTranslation();
  const format = useFormatters();
  const { state, reset } = useWizard();
  const { draft, receipt, values } = state;
  // The certificate is built from the stored policy, not from wizard state.
  const detail = usePolicy(draft?.id ?? '', { enabled: draft !== null });
  if (!draft) return null;

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center gap-4">
        <SuccessCheck />
        <p role="status" className="text-lg">
          {t('wizard.done.lead', { number: draft.policyNumber })}
        </p>
      </div>

      <Card variant="paper" className="p-6 sm:p-8">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <Item label={t('policy.number')} value={draft.policyNumber} />
          <Item
            label={t('policy.period')}
            value={t('policy.periodValue', {
              from: format.date(values.startDate),
              to: format.date(endDateFor(values.startDate, values.termMonths)),
            })}
          />
          {receipt && (
            <>
              <Item
                label={t('policy.amount')}
                value={format.money(receipt.amount, receipt.currency)}
              />
              <Item label={t('policy.reference')} value={receipt.reference} />
            </>
          )}
        </dl>
      </Card>

      <div className="flex flex-wrap gap-3">
        {detail.data ? (
          <CertificateButton detail={detail.data} />
        ) : (
          <Skeleton className="h-12 w-64" />
        )}
        <ButtonLink to={`/app/policies/${draft.id}`} variant="secondary">
          {t('wizard.done.viewPolicy')}
        </ButtonLink>
        <ButtonLink to="/app" variant="ghost">
          {t('workspace.backToOverview')}
        </ButtonLink>
      </div>
      <div className="border-t border-line pt-6">
        <Button variant="ghost" onClick={reset}>
          {t('wizard.done.another')}
        </Button>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-paper-muted">{label}</dt>
      <dd className="break-all tabular">{value}</dd>
    </div>
  );
}
