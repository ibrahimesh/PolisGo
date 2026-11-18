import { todayIso } from '../../lib/dates';

// Purchase wizard state. It lives in sessionStorage, keyed by user, so a
// reload keeps the step and the answers, a second account in the same tab
// never sees the first one's draft, and closing the tab forgets it — the
// same lifetime as the session token.

export const STEPS = ['cover', 'vehicle', 'review', 'payment', 'done'] as const;
export type StepId = (typeof STEPS)[number];

export interface WizardValues {
  policyTypeCode: string;
  startDate: string;
  termMonths: number;
  vehicleId: string;
}

// The Draft policy created on review. `valuesKey` records what it was
// created from, so going back and changing an answer replaces it.
export interface WizardDraft {
  id: string;
  policyNumber: string;
  premium: number;
  currency: string;
  valuesKey: string;
}

export interface WizardReceipt {
  reference: string;
  paidAt: string;
  amount: number;
  currency: string;
}

export interface WizardState {
  version: 1;
  step: StepId;
  values: WizardValues;
  draft: WizardDraft | null;
  receipt: WizardReceipt | null;
}

export function initialState(values: Partial<WizardValues> = {}): WizardState {
  return {
    version: 1,
    step: 'cover',
    // Cover from today, for a year: the most common choice.
    values: { policyTypeCode: '', startDate: todayIso(), termMonths: 12, vehicleId: '', ...values },
    draft: null,
    receipt: null,
  };
}

export function valuesKey(values: WizardValues): string {
  return JSON.stringify([
    values.policyTypeCode,
    values.vehicleId,
    values.startDate,
    values.termMonths,
  ]);
}

export function storageKey(userId: string): string {
  return `polisgo.buy.${userId}`;
}

function isState(value: unknown): value is WizardState {
  if (typeof value !== 'object' || value === null) return false;
  // Parsed JSON is untrusted: check each field rather than the declared type.
  const s = value as Record<string, unknown>;
  const v = s.values as Record<string, unknown> | null | undefined;
  return (
    s.version === 1 &&
    typeof s.step === 'string' &&
    (STEPS as readonly string[]).includes(s.step) &&
    typeof v === 'object' &&
    v !== null &&
    typeof v.policyTypeCode === 'string' &&
    typeof v.startDate === 'string' &&
    typeof v.termMonths === 'number' &&
    typeof v.vehicleId === 'string'
  );
}

export function loadState(userId: string, storage: Storage = sessionStorage): WizardState | null {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) return null;
    // Payment and success need the draft they belong to; without it, review again.
    if ((parsed.step === 'payment' || parsed.step === 'done') && !parsed.draft) {
      return { ...parsed, step: 'review' };
    }
    return { ...parsed, draft: parsed.draft ?? null, receipt: parsed.receipt ?? null };
  } catch {
    return null;
  }
}

export function saveState(userId: string, state: WizardState, storage: Storage = sessionStorage) {
  try {
    storage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Storage blocked (privacy mode): the wizard still works for this page.
  }
}

export function clearState(userId: string, storage: Storage = sessionStorage) {
  try {
    storage.removeItem(storageKey(userId));
  } catch {
    // Nothing to clear.
  }
}

// Which steps the stepper lets you jump back to. After payment the purchase
// is final, so only the success screen remains.
export function canVisit(state: WizardState, target: StepId): boolean {
  const current = STEPS.indexOf(state.step);
  const index = STEPS.indexOf(target);
  if (state.step === 'done') return target === 'done';
  if (target === 'payment') return state.draft !== null && index <= current;
  return index < current;
}
