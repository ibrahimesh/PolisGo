import { useTranslation } from 'react-i18next';
import { Button, ButtonLink } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { CheckIcon } from '../../../components/ui/icons';
import { useClaimWizard } from './ClaimWizardContext';

export function DoneStep() {
  const { t } = useTranslation();
  const { state, files, reset } = useClaimWizard();
  const claim = state.claim;
  if (!claim) return null;
  const uploaded = files.items.filter((item) => item.status === 'done').length;

  return (
    <div className="max-w-3xl space-y-8">
      <Card variant="paper" className="space-y-4 p-6 sm:p-8">
        <p className="flex items-center gap-2 font-medium text-paper-accent">
          <CheckIcon />
          {t('claimWizard.done.filed')}
        </p>
        <p className="font-serif text-3xl break-all tabular">{claim.claimNumber}</p>
        <p className="text-paper-muted">
          {uploaded > 0
            ? t('claimWizard.done.documents', { count: uploaded })
            : t('claimWizard.done.noDocuments')}
        </p>
      </Card>
      <div className="space-y-2 leading-relaxed text-muted">
        <p>{t('claimWizard.done.next')}</p>
        <p>{t('claimWizard.done.channels')}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to={`/app/claims/${claim.id}`} size="lg">
          {t('claimWizard.done.view')}
        </ButtonLink>
        <ButtonLink to="/app/claims" variant="secondary" size="lg">
          {t('claimWizard.done.all')}
        </ButtonLink>
        <Button variant="ghost" size="lg" onClick={reset}>
          {t('claimWizard.done.another')}
        </Button>
      </div>
    </div>
  );
}
