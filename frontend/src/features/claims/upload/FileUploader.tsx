import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import {
  AlertIcon,
  CheckIcon,
  FileIcon,
  TrashIcon,
  UploadIcon,
} from '../../../components/ui/icons';
import { ReferenceChip } from '../../../components/ui/ReferenceChip';
import { useFormatters } from '../../../i18n/format';
import { ACCEPT_ATTRIBUTE, CLAIM_RULES } from '../claimRules';
import type { FileQueue, QueueItem } from './useFileQueue';

function sizeLabel(bytes: number, amount: (n: number) => string) {
  return bytes >= 1024 * 1024
    ? `${amount(bytes / (1024 * 1024))} MB`
    : `${amount(Math.max(bytes, 1) / 1024)} KB`;
}

// Drag and drop is a shortcut; the real control is the "Choose files" button
// (a native file picker), so keyboard and screen-reader users get the same
// path. Files are checked on arrival — type, size, first bytes — and a
// rejected file is named with the reason instead of being dropped silently.
export function FileUploader({
  queue,
  remaining,
  disabled = false,
  onAdded,
  label,
}: {
  queue: FileQueue;
  // How many more files the claim can take.
  remaining: number;
  disabled?: boolean;
  // Called after files were accepted (the detail page uploads at once).
  onAdded?: () => void;
  label: string;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const hintId = useId();
  const full = remaining <= 0;

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const { accepted, rejected } = await queue.add(files);
    setAnnouncement(
      [
        accepted > 0 ? t('upload.added', { count: accepted }) : null,
        rejected.length > 0 ? t('upload.notAdded', { count: rejected.length }) : null,
      ]
        .filter(Boolean)
        .join(' '),
    );
    if (accepted > 0) onAdded?.();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || full) return;
    void addFiles([...event.dataTransfer.files]);
  };

  return (
    <div className="space-y-4">
      {/* Drop target only; the button inside is the accessible control. */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'flex flex-col items-start gap-4 rounded-sm border border-dashed p-6 transition-colors sm:flex-row sm:items-center sm:justify-between',
          dragging ? 'border-accent bg-surface-2' : 'border-line-strong',
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-muted" aria-hidden="true">
            <UploadIcon />
          </span>
          <div className="space-y-1">
            <p className="font-medium">{label}</p>
            <p id={hintId} className="text-sm text-muted">
              {t('upload.hint', {
                size: CLAIM_RULES.maxFileBytes / (1024 * 1024),
                count: CLAIM_RULES.maxDocuments,
              })}
              {full ? ` ${t('upload.full')}` : ''}
            </p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            // Reset, so choosing the same file again fires change.
            event.target.value = '';
            void addFiles(files);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || full}
          aria-describedby={hintId}
          onClick={() => inputRef.current?.click()}
        >
          {t('upload.choose')}
        </Button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {queue.rejections.length > 0 && (
        <ul className="space-y-1 text-sm text-danger">
          {queue.rejections.map((rejection, i) => (
            <li key={`${rejection.name}-${String(i)}`} className="flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0">
                <AlertIcon />
              </span>
              <span className="min-w-0 break-all">
                {t('upload.rejected', {
                  name: rejection.name,
                  reason: t(`upload.problems.${rejection.problem}`, {
                    size: CLAIM_RULES.maxFileBytes / (1024 * 1024),
                    count: CLAIM_RULES.maxDocuments,
                  }),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {queue.items.length > 0 && (
        <ul
          aria-label={t('upload.listLabel')}
          className="divide-y divide-line border-y border-line"
        >
          {queue.items.map((item) => (
            <QueueRow
              key={item.key}
              item={item}
              size={sizeLabel(item.file.size, format.amount)}
              onRemove={
                item.status === 'ready' || item.status === 'error'
                  ? () => queue.remove(item.key)
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueRow({
  item,
  size,
  onRemove,
}: {
  item: QueueItem;
  size: string;
  onRemove: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const percent = Math.round(item.progress * 100);
  return (
    <li className="flex items-center gap-4 py-3">
      {item.preview ? (
        <img
          src={item.preview}
          alt=""
          className="size-12 shrink-0 rounded-sm border border-line object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-sm border border-line text-muted"
        >
          <FileIcon />
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="text-sm text-muted tabular">
          {size}
          {item.status === 'done' && (
            <span className="ml-2 inline-flex items-center gap-1 text-success">
              <CheckIcon />
              {t('upload.status.done')}
            </span>
          )}
          {item.status === 'uploading' && <span className="ml-2">{percent}%</span>}
        </p>
        {item.status === 'uploading' && (
          <div
            role="progressbar"
            aria-label={t('upload.progressLabel', { name: item.file.name })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1 w-full overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${String(percent)}%` }}
            />
          </div>
        )}
        {item.status === 'error' && item.errorKey && (
          <p className="flex items-start gap-1.5 text-sm text-danger">
            <span className="mt-0.5 shrink-0">
              <AlertIcon />
            </span>
            <span className="space-y-1">
              <span className="block">{t(item.errorKey)}</span>
              {item.traceId && <ReferenceChip traceId={item.traceId} />}
            </span>
          </p>
        )}
      </div>
      {onRemove && (
        <Button variant="ghost" size="sm" onClick={onRemove} className="shrink-0">
          <TrashIcon />
          <span className="sr-only sm:not-sr-only">{t('upload.remove')}</span>
          <span className="sr-only"> {item.file.name}</span>
        </Button>
      )}
    </li>
  );
}
