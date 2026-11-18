import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PolicyDetailResponse } from '../../api/types';
import { currentLanguage } from '../../i18n';
import { Button } from '../../components/ui/Button';
import { DownloadIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/ToastProvider';
import { useFormatters } from '../../i18n/format';

export function CertificateButton({
  detail,
  variant = 'primary',
}: {
  detail: PolicyDetailResponse;
  variant?: 'primary' | 'secondary';
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      // pdf-lib, fontkit and the font files load only now.
      const { downloadCertificate } = await import('./downloadCertificate');
      await downloadCertificate(detail, t, format, currentLanguage());
    } catch {
      toast({ title: t('certificate.failed'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} loading={busy} onClick={() => void download()}>
      {!busy && <DownloadIcon />}
      {busy ? t('certificate.preparing') : t('certificate.download')}
    </Button>
  );
}
