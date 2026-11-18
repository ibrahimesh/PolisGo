import type { TFunction } from 'i18next';
import type { PolicyDetailResponse } from '../../api/types';
import { buildCertificatePdf } from './certificatePdf';
import { certificateContent } from './certificateContent';
import type { CertificateFormatters } from './certificateContent';
import { loadFonts } from './fonts';
import { subsetsFor } from './textRuns';

// Entry point of the lazily loaded certificate chunk (pdf-lib, fontkit and
// the font URLs): nothing here is downloaded until someone asks for a PDF.
export async function downloadCertificate(
  detail: PolicyDetailResponse,
  t: TFunction,
  format: CertificateFormatters,
  language: string,
): Promise<void> {
  const generatedAt = format.dateTime(new Date().toISOString());
  const content = certificateContent(detail, t, format, language, generatedAt);
  const fonts = await loadFonts(subsetsFor([JSON.stringify(content)]));
  const bytes = await buildCertificatePdf(content, fonts);

  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `PolisGo-${detail.policy.policyNumber}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
