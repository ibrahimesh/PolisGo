import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { claimsApi } from '../../../api/endpoints';
import type { ClaimDocumentResponse, Guid } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { DownloadIcon, EyeIcon, FileIcon } from '../../../components/ui/icons';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useFormatters } from '../../../i18n/format';
import { downloadClaimDocument } from '../../claims/downloadDocument';

// The claim's photos and PDFs: open in the page for a look, or download.
export function ReviewDocuments({
  claimId,
  documents,
}: {
  claimId: Guid;
  documents: readonly ClaimDocumentResponse[];
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const [previewing, setPreviewing] = useState<ClaimDocumentResponse | null>(null);
  const download = useMutation({
    mutationFn: (document: ClaimDocumentResponse) => downloadClaimDocument(claimId, document),
  });

  return (
    <section aria-labelledby="review-documents-title" className="space-y-4">
      <h2 id="review-documents-title" className="text-2xl">
        {t('claimDetail.documents.title')}
      </h2>
      {download.isError && <ErrorNotice error={download.error} />}
      {documents.length === 0 ? (
        <p className="text-muted">{t('staff.review.noDocuments')}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span aria-hidden="true" className="text-muted">
                <FileIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={document.fileName}>
                  {document.fileName}
                </p>
                <p className="text-sm text-muted">{format.dateTime(document.uploadedAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPreviewing(document)}>
                  <EyeIcon />
                  {t('staff.review.preview')}
                  <span className="sr-only"> {document.fileName}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={download.isPending && download.variables.id === document.id}
                  onClick={() => download.mutate(document)}
                >
                  <DownloadIcon />
                  <span className="sr-only sm:not-sr-only">
                    {t('claimDetail.documents.download')}
                  </span>
                  <span className="sr-only"> {document.fileName}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={previewing !== null}
        onClose={() => setPreviewing(null)}
        title={previewing?.fileName ?? ''}
        size="wide"
      >
        {previewing && <Preview claimId={claimId} document={previewing} />}
      </Modal>
    </section>
  );
}

// The file is fetched with the bearer token, then shown from a blob URL that
// is revoked when the preview closes.
function Preview({ claimId, document }: { claimId: Guid; document: ClaimDocumentResponse }) {
  const { t } = useTranslation();
  const file = useQuery({
    queryKey: ['claim-document', claimId, document.id],
    queryFn: () => claimsApi.downloadDocument(claimId, document.id),
    gcTime: 0,
    staleTime: Infinity,
  });
  const url = useMemo(() => (file.data ? URL.createObjectURL(file.data) : null), [file.data]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  if (file.isError) return <ErrorNotice error={file.error} />;
  if (!url) {
    return (
      <div aria-busy="true">
        <span className="sr-only" role="status">
          {t('common.loading')}
        </span>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return document.contentType === 'application/pdf' ? (
    <iframe
      src={url}
      title={document.fileName}
      className="h-[70dvh] w-full rounded-sm border border-line bg-surface"
    />
  ) : (
    <img
      src={url}
      alt={t('staff.review.previewAlt', { name: document.fileName })}
      className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-sm border border-line object-contain"
    />
  );
}
