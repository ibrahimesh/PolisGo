import type { PolicyResponse } from '../../api/types';
import { todayIso } from '../../lib/dates';

// Mirrors ClaimValidation.cs. The API applies the same rules; its 400s map
// back onto these fields, so the two sides must change together.
export const CLAIM_RULES = {
  minDescription: 10,
  maxDescription: 2000,
  minLocation: 3,
  maxLocation: 200,
  maxAmount: 50_000,
  maxReason: 500,
  maxSearch: 100,
  maxFileBytes: 5 * 1024 * 1024,
  maxDocuments: 10,
} as const;

export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'] as const;
// For the file picker; the extension and the first bytes are what count.
export const ACCEPT_ATTRIBUTE = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

export type Eligibility =
  | { eligible: true }
  | { eligible: false; reason: 'unpaid' | 'ended' | 'cancelled' | 'notStarted'; date?: string };

// Which policies can take a claim today. Statuses from the API are already
// effective (an Active policy past its end date reads as Expired).
export function claimEligibility(policy: PolicyResponse, today: string = todayIso()): Eligibility {
  switch (policy.status) {
    case 'Draft':
      return { eligible: false, reason: 'unpaid' };
    case 'Expired':
      return { eligible: false, reason: 'ended', date: policy.endDate };
    case 'Cancelled':
      return { eligible: false, reason: 'cancelled' };
    case 'Active':
      return policy.startDate > today
        ? { eligible: false, reason: 'notStarted', date: policy.startDate }
        : { eligible: true };
  }
}

// The incident must fall inside the cover and not in the future; also the
// date input's min and max.
export function incidentDateBounds(
  policy: { startDate: string; endDate: string },
  today: string = todayIso(),
) {
  return {
    coverStart: policy.startDate,
    coverEnd: policy.endDate,
    today,
    min: policy.startDate,
    max: policy.endDate < today ? policy.endDate : today,
  };
}

export type FileProblem = 'fileType' | 'fileEmpty' | 'fileTooLarge' | 'fileContent';

const SIGNATURES: Record<string, readonly number[]> = {
  '.jpg': [0xff, 0xd8, 0xff],
  '.jpeg': [0xff, 0xd8, 0xff],
  '.png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  '.pdf': [0x25, 0x50, 0x44, 0x46],
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

// Same checks as the server, in the same order: type by name, size, then the
// first bytes, so a renamed .exe never starts uploading.
export async function checkFile(file: File): Promise<FileProblem | null> {
  const extension = extensionOf(file.name);
  const signature = SIGNATURES[extension];
  if (!signature) return 'fileType';
  if (file.size === 0) return 'fileEmpty';
  if (file.size > CLAIM_RULES.maxFileBytes) return 'fileTooLarge';
  const head = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  return signature.every((byte, i) => head[i] === byte) ? null : 'fileContent';
}

export function isImage(name: string): boolean {
  return ['.jpg', '.jpeg', '.png'].includes(extensionOf(name));
}
