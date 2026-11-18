import { todayIso } from '../../lib/dates';

// Exports and documents need the bearer token, so a plain link can't fetch
// them: fetch the blob, then hand it to the browser as a download.
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Revoke after the click has been handled.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// The server names the file too, but a cross-origin response hides its
// Content-Disposition; the same pattern is built here.
export const exportFileName = (kind: 'claims' | 'policies', today = todayIso()) =>
  `${kind}-${today}.csv`;
