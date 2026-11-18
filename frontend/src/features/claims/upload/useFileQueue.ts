import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '../../../api/errors';
import type { ClaimDocumentResponse, Guid } from '../../../api/types';
import { uploadClaimDocument } from '../../../api/upload';
import { describeError, fieldMessageKey } from '../../../i18n/apiErrors';
import { checkFile, isImage } from '../claimRules';
import type { FileProblem } from '../claimRules';
import { loadPendingFiles, savePendingFiles } from './pendingFiles';

export type QueueStatus = 'ready' | 'uploading' | 'done' | 'error';

export interface QueueItem {
  key: string;
  file: File;
  status: QueueStatus;
  // 0..1 while uploading.
  progress: number;
  // An i18n key and the server's trace id, when the upload failed.
  errorKey: string | null;
  traceId: string | undefined;
  // Object URL for an image thumbnail.
  preview: string | null;
}

export interface Rejection {
  name: string;
  problem: FileProblem | 'tooMany';
}

let counter = 0;
function newItem(file: File): QueueItem {
  counter += 1;
  return {
    key: `${String(Date.now())}-${String(counter)}`,
    file,
    status: 'ready',
    progress: 0,
    errorKey: null,
    traceId: undefined,
    preview: isImage(file.name) ? URL.createObjectURL(file) : null,
  };
}

// A 400 on the file field says exactly what was wrong (type, size, content);
// anything else (409 closed or full, 404, network) uses the general message.
export function uploadErrorKey(error: unknown): string {
  if (isApiError(error) && error.status === 400) {
    const messages = error.fieldErrors.file;
    if (messages) return fieldMessageKey(messages);
  }
  return describeError(error).messageKey;
}

// Files waiting for, or going through, upload to one claim. `limit` is how
// many more documents the claim can take. With `persistKey` the waiting files
// survive a reload (the claim wizard, before the claim exists).
export function useFileQueue({ limit, persistKey }: { limit: number; persistKey?: string }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // Don't save (and so wipe) the stored files before they were read back.
  const [restored, setRestored] = useState(!persistKey);

  useEffect(() => {
    if (!persistKey) return;
    let cancelled = false;
    void loadPendingFiles(persistKey).then((files) => {
      if (cancelled) return;
      if (files.length > 0) setItems(files.map(newItem));
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey || !restored) return;
    void savePendingFiles(
      persistKey,
      items.filter((i) => i.status !== 'done').map((i) => i.file),
    );
  }, [items, persistKey, restored]);

  // Thumbnails are object URLs: free them when the queue goes away.
  useEffect(
    () => () => {
      for (const item of itemsRef.current) if (item.preview) URL.revokeObjectURL(item.preview);
    },
    [],
  );

  const add = useCallback(
    async (files: readonly File[]) => {
      const accepted: File[] = [];
      const rejected: Rejection[] = [];
      let room = limit - itemsRef.current.length;
      for (const file of files) {
        const problem = await checkFile(file);
        if (problem) rejected.push({ name: file.name, problem });
        else if (room <= 0) rejected.push({ name: file.name, problem: 'tooMany' });
        else {
          accepted.push(file);
          room -= 1;
        }
      }
      setRejections(rejected);
      if (accepted.length > 0) {
        const added = accepted.map(newItem);
        // Keep the ref current at once: an immediate upload reads it.
        itemsRef.current = [...itemsRef.current, ...added];
        setItems((current) => [...current, ...added]);
      }
      return { accepted: accepted.length, rejected };
    },
    [limit],
  );

  const remove = useCallback((key: string) => {
    setItems((current) => {
      const item = current.find((i) => i.key === key);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return current.filter((i) => i.key !== key);
    });
  }, []);

  const patch = useCallback((key: string, change: Partial<QueueItem>) => {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }, []);

  // One file at a time: each gets its own progress bar and its own error, and
  // the per-claim document limit on the server is never raced.
  const upload = useCallback(
    async (claimId: Guid) => {
      const uploaded: ClaimDocumentResponse[] = [];
      let failed = 0;
      const pending = itemsRef.current.filter((i) => i.status !== 'done');
      for (const item of pending) {
        patch(item.key, { status: 'uploading', progress: 0, errorKey: null, traceId: undefined });
        try {
          const document = await uploadClaimDocument(claimId, item.file, {
            onProgress: (progress) => {
              patch(item.key, { progress });
            },
          });
          uploaded.push(document);
          patch(item.key, { status: 'done', progress: 1 });
        } catch (error) {
          failed += 1;
          patch(item.key, {
            status: 'error',
            errorKey: uploadErrorKey(error),
            traceId: isApiError(error) ? error.traceId : undefined,
          });
        }
      }
      return { uploaded, failed };
    },
    [patch],
  );

  const clearDone = useCallback(() => {
    setItems((current) => {
      for (const item of current)
        if (item.status === 'done' && item.preview) URL.revokeObjectURL(item.preview);
      return current.filter((i) => i.status !== 'done');
    });
  }, []);

  const reset = useCallback(() => {
    for (const item of itemsRef.current) if (item.preview) URL.revokeObjectURL(item.preview);
    setItems([]);
    setRejections([]);
  }, []);

  return { items, rejections, restored, add, remove, upload, clearDone, reset };
}

export type FileQueue = ReturnType<typeof useFileQueue>;
