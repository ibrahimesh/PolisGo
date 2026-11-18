import type { PolicyDetailResponse } from '../../api/types';

// A certificate is evidence of cover, so it exists only for a policy that was
// paid: Active, Expired, or Cancelled after payment (the PDF prints the status).
export function canDownloadCertificate(detail: PolicyDetailResponse): boolean {
  return detail.payments.some((payment) => payment.status === 'Completed');
}
