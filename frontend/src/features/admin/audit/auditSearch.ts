import type { TFunction } from 'i18next';
import { CLAIM_STATUSES } from '../../../api/types';
import type { PolicyStatus } from '../../../api/types';
import { foldSearch } from '../../../lib/searchText';

// The API matches names, emails, numbers and English codes; the words the
// page shows ("Одобрено", "Rədd edilib", "role Agent → Admin") are
// translations. So the SPA turns the typed text into the codes whose label,
// in the current language, contains it, and sends those along (`actions`).

const POLICY_STATUSES: readonly PolicyStatus[] = ['Draft', 'Active', 'Expired', 'Cancelled'];
const ACTION_LABELS = {
  StaffCreated: ['admin.audit.actions.StaffCreated'],
  StaffDeactivated: ['admin.audit.actions.StaffDeactivated'],
  StaffReactivated: ['admin.audit.actions.StaffReactivated'],
  RoleChanged: ['admin.audit.actions.RoleChanged'],
  CustomerAssigned: ['admin.audit.actions.assigned', 'admin.audit.actions.released'],
} as const;

// Shorter text would match half the vocabulary ("a", "ро").
export const MIN_CODE_MATCH = 3;

// Folded like the API's search (I/İ/ı, ё), so "İŞÇİ" finds "işçi".
const normalise = (text: string) => foldSearch(text.replace(/\{\{[^}]+\}\}/g, ' '));

export function matchAuditCodes(search: string, t: TFunction): string[] {
  const needle = normalise(search);
  if (needle.length < MIN_CODE_MATCH) return [];
  const has = (key: string) => normalise(t(key)).includes(needle);

  const codes = new Set<string>();
  for (const status of CLAIM_STATUSES) if (has(`claimStatus.${status}`)) codes.add(status);
  for (const status of POLICY_STATUSES) if (has(`policyStatus.${status}`)) codes.add(status);
  for (const [action, keys] of Object.entries(ACTION_LABELS)) {
    if (keys.some(has)) codes.add(action);
  }
  return [...codes].sort();
}
