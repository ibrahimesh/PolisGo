import { createContext, useContext } from 'react';
import type { StepId, WizardDraft, WizardReceipt, WizardState, WizardValues } from './wizardState';

export interface WizardApi {
  state: WizardState;
  setValues: (patch: Partial<WizardValues>) => void;
  setDraft: (draft: WizardDraft | null) => void;
  // Moving back to an editable step cancels an unpaid draft, so the new
  // answers can't collide with it (the API rejects overlapping cover).
  goTo: (step: StepId) => Promise<void>;
  complete: (receipt: WizardReceipt) => void;
  reset: () => void;
  // True while goTo is cancelling a draft.
  navigating: boolean;
}

export const WizardContext = createContext<WizardApi | null>(null);

export function useWizard(): WizardApi {
  const context = useContext(WizardContext);
  if (!context) throw new Error('useWizard must be used inside the purchase wizard.');
  return context;
}
