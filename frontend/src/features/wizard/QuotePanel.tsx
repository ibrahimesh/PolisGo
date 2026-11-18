import { useTranslation } from 'react-i18next';
import type { PremiumBreakdown } from '../../api/types';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { firstFieldMessageKey } from '../../i18n/apiErrors';
import { usePolicy } from '../cabinet/queries';
import { useProductName } from '../policies/useProductName';
import { QuoteResult } from '../quote/QuoteResult';
import { createCoverSchema } from './wizardSchema';
import type { WizardValues } from './wizardState';
import { useLiveQuote } from './useLiveQuote';
import { useWizard } from './WizardContext';

export function QuotePanel({ values }: { values: WizardValues }) {
  const { t } = useTranslation();
  const product = useProductName();
  const { state } = useWizard();
  const quote = useLiveQuote(values);
  // Once a draft exists, its frozen pricing is the price; re-quoting would
  // collide with the draft itself.
  const draft = state.draft;
  const draftDetail = usePolicy(draft?.id ?? '', { enabled: draft !== null });

  if (!values.vehicleId) {
    return (
      <p className="rounded-sm border border-line p-6 text-muted">
        {t('wizard.quote.needVehicle')}
      </p>
    );
  }

  const breakdown: PremiumBreakdown | undefined = draft
    ? (draftDetail.data?.pricing ?? undefined)
    : quote.data;
  const error = draft ? null : quote.error;

  // Nothing to price yet (an answer is missing or invalid): say so plainly
  // rather than showing a loading placeholder that never resolves.
  const priceable = createCoverSchema().safeParse(values).success;
  if (!draft && !priceable) {
    return (
      <p className="rounded-sm border border-line p-6 text-muted">{t('calculator.waiting')}</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* No figure to show for an unpriceable combination: just say why. */}
      {(breakdown || !error) && (
        <QuoteResult
          breakdown={breakdown}
          productLabel={product.name(values.policyTypeCode) || '—'}
          termMonths={values.termMonths}
          updating={!draft && quote.isFetching}
          stale={!draft && (quote.isPlaceholderData || quote.isError)}
          label={t('wizard.quote.label')}
          note={t('wizard.quote.note')}
        />
      )}
      {error && (
        <ErrorNotice
          error={error}
          title={t('wizard.quote.errorTitle')}
          overrides={{ 400: firstFieldMessageKey(error) }}
        />
      )}
    </div>
  );
}
