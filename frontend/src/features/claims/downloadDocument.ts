import { claimsApi } from '../../api/endpoints';
import type { ClaimDocumentResponse, Guid } from '../../api/types';

// Documents need the bearer token, so a plain link can't fetch them: fetch the
// blob, then hand it to the browser as a download under its stored name.
export async function downloadClaimDocument(claimId: Guid, document: ClaimDocumentResponse) {
  const blob = await claimsApi.downloadDocument(claimId, document.id);
  const url = URL.createObjectURL(blob);
  try {
    const link = window.document.createElement('a');
    link.href = url;
    link.download = document.fileName;
    window.document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Revoke after the click has been handled.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
