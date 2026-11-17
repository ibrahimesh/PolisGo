import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import type { WorkspaceSectionId } from './sections';

// Placeholder for role areas that ship in later steps; the guard around it is real.
export function WorkspaceSection({ section }: { section: WorkspaceSectionId }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      headingLevel="h1"
      label={t(`workspace.sections.${section}`)}
      title={t('workspace.comingSoonTitle')}
      body={t('workspace.comingSoonBody')}
      action={
        <ButtonLink to="/app" variant="secondary" size="sm">
          {t('workspace.backToOverview')}
        </ButtonLink>
      }
    />
  );
}
