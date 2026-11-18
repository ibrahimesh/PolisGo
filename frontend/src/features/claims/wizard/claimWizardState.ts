import type { IncidentType } from '../../../api/types';

// Claim wizard state, in sessionStorage per user like the purchase wizard: a
// reload keeps the step and the answers, another account in the same tab
// never sees them. Picked files live in IndexedDB (pendingFiles.ts).

export const CLAIM_STEPS = ['policy', 'incident', 'damage', 'documents', 'review'] as const;
export type ClaimStep = (typeof CLAIM_STEPS)[number];
// The success screen comes after the five steps and is not one of them.
export type ClaimScreen = ClaimStep | 'done';

export interface ClaimValues {
  policyId: string;
  incidentDate: string;
  incidentType: IncidentType | '';
  location: string;
  description: string;
  // As typed (comma or point), so it reloads exactly.
  claimedAmount: string;
}

// Set once the API accepted the claim: from then on the answers are final and
// only the document uploads can be retried.
export interface FiledClaim {
  id: string;
  claimNumber: string;
}

export interface ClaimWizardState {
  version: 1;
  step: ClaimScreen;
  values: ClaimValues;
  claim: FiledClaim | null;
}

export function initialClaimState(values: Partial<ClaimValues> = {}): ClaimWizardState {
  return {
    version: 1,
    step: 'policy',
    values: {
      policyId: '',
      incidentDate: '',
      incidentType: '',
      location: '',
      description: '',
      claimedAmount: '',
      ...values,
    },
    claim: null,
  };
}

export function claimStorageKey(userId: string): string {
  return `polisgo.claim.${userId}`;
}

// Which step holds each field the API can reject, for mapping a 400 back.
export const FIELD_STEP: Record<string, ClaimStep> = {
  policyId: 'policy',
  incidentDate: 'incident',
  incidentType: 'incident',
  location: 'incident',
  description: 'incident',
  claimedAmount: 'damage',
};

const SCREENS: readonly string[] = [...CLAIM_STEPS, 'done'];

function isState(value: unknown): value is ClaimWizardState {
  if (typeof value !== 'object' || value === null) return false;
  // Parsed JSON is untrusted: check each field rather than the declared type.
  const s = value as Record<string, unknown>;
  const v = s.values as Record<string, unknown> | null | undefined;
  return (
    s.version === 1 &&
    typeof s.step === 'string' &&
    SCREENS.includes(s.step) &&
    typeof v === 'object' &&
    v !== null &&
    ['policyId', 'incidentDate', 'incidentType', 'location', 'description', 'claimedAmount'].every(
      (key) => typeof v[key] === 'string',
    )
  );
}

export function loadClaimState(
  userId: string,
  storage: Storage = sessionStorage,
): ClaimWizardState | null {
  try {
    const raw = storage.getItem(claimStorageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) return null;
    const claim = parsed.claim ?? null;
    // The success screen needs the claim it belongs to.
    if (parsed.step === 'done' && !claim) return { ...parsed, step: 'review', claim };
    return { ...parsed, claim };
  } catch {
    return null;
  }
}

export function saveClaimState(
  userId: string,
  state: ClaimWizardState,
  storage: Storage = sessionStorage,
) {
  try {
    storage.setItem(claimStorageKey(userId), JSON.stringify(state));
  } catch {
    // Storage blocked: the wizard still works for this page.
  }
}

export function clearClaimState(userId: string, storage: Storage = sessionStorage) {
  try {
    storage.removeItem(claimStorageKey(userId));
  } catch {
    // Nothing to clear.
  }
}

// Earlier steps can be revisited until the claim is filed; after that the
// answers are on record and only the review (for upload retries) remains.
export function canVisitClaimStep(state: ClaimWizardState, target: ClaimStep): boolean {
  if (state.claim || state.step === 'done') return false;
  return CLAIM_STEPS.indexOf(target) < CLAIM_STEPS.indexOf(state.step);
}
