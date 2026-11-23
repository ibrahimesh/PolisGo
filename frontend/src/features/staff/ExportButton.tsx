import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { DownloadIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/ToastProvider';
import { describeError } from '../../i18n/apiErrors';
import { useExclusive } from '../../lib/hooks';
import { saveBlob } from './saveBlob';

// "Export CSV" for a list: the server applies the list's current filters, so
// the file holds exactly the rows on screen, across every page.
export function ExportButton({
  fetchCsv,
  fileName,
  disabled,
}: {
  fetchCsv: () => Promise<Blob>;
  fileName: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const exclusive = useExclusive();
  const download = useMutation({
    mutationFn: async () => saveBlob(await fetchCsv(), fileName),
    onError: (error) => {
      const { messageKey, traceId } = describeError(error);
      toast.toast({
        tone: 'error',
        title: t('staff.export.failed'),
        description: t(messageKey),
        traceId,
      });
    },
  });

  return (
    <Button
      variant="secondary"
      loading={download.isPending}
      disabled={disabled}
      onClick={() =>
        void exclusive(() =>
          download.mutateAsync().then(
            () => undefined,
            () => undefined,
          ),
        )
      }
    >
      <DownloadIcon />
      {t('staff.export.button')}
    </Button>
  );
}
