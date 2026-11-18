import { createContext, useContext } from 'react';
import type { PolicyResponse } from '../../../api/types';
import type { FileQueue } from '../upload/useFileQueue';
import type { ClaimScreen, ClaimValues, ClaimWizardState, FiledClaim } from './claimWizardState';

export interface ClaimWizardApi {
  state: ClaimWizardState;
  // The client's policies (all statuses), for the choice and the date bounds.
  policies: readonly PolicyResponse[];
  selectedPolicy: PolicyResponse | undefined;
  files: FileQueue;
  setValues: (patch: Partial<ClaimValues>) => void;
  goTo: (step: ClaimScreen) => void;
  setClaim: (claim: FiledClaim) => void;
  // Field errors from a rejected submit, keyed by field, as i18n keys. The
  // step that owns the field applies them when it renders.
  serverErrors: Readonly<Record<string, string>>;
  setServerErrors: (errors: Record<string, string>) => void;
  reset: () => void;
}

export const ClaimWizardContext = createContext<ClaimWizardApi | null>(null);

export function useClaimWizard(): ClaimWizardApi {
  const context = useContext(ClaimWizardContext);
  if (!context) throw new Error('useClaimWizard must be used inside the claim wizard.');
  return context;
}
