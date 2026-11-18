import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { AlertIcon } from '../../../components/ui/icons';
import { useClaimWizard } from './ClaimWizardContext';
import type { ClaimScreen } from './claimWizardState';

export function StepFooter({
  back,
  submitLabel,
  loading = false,
  extra,
}: {
  back?: ClaimScreen;
  submitLabel?: string;
  loading?: boolean;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  const { goTo } = useClaimWizard();
  return (
    <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6">
      {back ? (
        <Button variant="ghost" size="lg" onClick={() => goTo(back)}>
          {t('wizard.back')}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap gap-3">
        {extra}
        <Button type="submit" size="lg" loading={loading}>
          {submitLabel ?? t('wizard.continue')}
        </Button>
      </div>
    </div>
  );
}

// For groups (radios) that Field doesn't wrap.
export function GroupError({ id, message }: { id: string; message: string | undefined }) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-danger">
      <span className="mt-0.5 shrink-0">
        <AlertIcon />
      </span>
      {t(message)}
    </p>
  );
}
