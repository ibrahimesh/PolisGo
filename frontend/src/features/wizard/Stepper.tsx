import { useTranslation } from 'react-i18next';
import { StepNav } from '../../components/ui/StepNav';
import { useWizard } from './WizardContext';
import { canVisit, STEPS } from './wizardState';

export function Stepper() {
  const { t } = useTranslation();
  const { state, goTo, navigating } = useWizard();
  return (
    <StepNav
      label={t('wizard.progress')}
      steps={STEPS.map((id) => ({ id, label: t(`wizard.steps.${id}.short`) }))}
      current={state.step}
      canVisit={(step) => canVisit(state, step) && !navigating}
      onSelect={(step) => void goTo(step)}
    />
  );
}
