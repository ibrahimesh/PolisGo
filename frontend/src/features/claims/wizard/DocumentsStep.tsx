import { useTranslation } from 'react-i18next';
import { CLAIM_RULES } from '../claimRules';
import { FileUploader } from '../upload/FileUploader';
import { useClaimWizard } from './ClaimWizardContext';
import { StepFooter } from './stepParts';

// Optional: files are picked here and uploaded right after the claim is
// filed (the API needs the claim first). More can be added later from the
// claim's page while it is open.
export function DocumentsStep() {
  const { t } = useTranslation();
  const { files, goTo } = useClaimWizard();
  return (
    <form
      noValidate
      aria-labelledby="claim-step-title"
      onSubmit={(event) => {
        event.preventDefault();
        goTo('review');
      }}
      className="max-w-3xl space-y-8"
    >
      <div className="space-y-3 text-muted">
        <p>{t('claimWizard.documents.lead')}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t('claimWizard.documents.tips.photos')}</li>
          <li>{t('claimWizard.documents.tips.police')}</li>
          <li>{t('claimWizard.documents.tips.estimate')}</li>
        </ul>
      </div>
      <FileUploader
        queue={files}
        remaining={CLAIM_RULES.maxDocuments - files.items.length}
        label={t('upload.dropLabel')}
      />
      <StepFooter
        back="damage"
        submitLabel={files.items.length === 0 ? t('claimWizard.documents.skip') : undefined}
      />
    </form>
  );
}
