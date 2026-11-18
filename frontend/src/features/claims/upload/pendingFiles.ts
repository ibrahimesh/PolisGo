// Files picked in the claim wizard before the claim exists. sessionStorage
// cannot hold a File and IndexedDB can, so a reload keeps the photos as well
// as the answers. Keyed by user; cleared on submit, on reset and on sign-out
// (clearAllPendingFiles). Without IndexedDB (private mode, unit tests) the
// wizard still works; the files just don't survive a reload.

const DB_NAME = 'polisgo';
const STORE = 'claim-files';

interface StoredFile {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

export async function loadPendingFiles(key: string): Promise<File[]> {
  try {
    const stored = (await run('readonly', (s) => s.get(key))) as StoredFile[] | undefined;
    return (stored ?? []).map(
      (f) => new File([f.blob], f.name, { type: f.type, lastModified: f.lastModified }),
    );
  } catch {
    return [];
  }
}

export async function savePendingFiles(key: string, files: readonly File[]): Promise<void> {
  try {
    if (files.length === 0) {
      await run('readwrite', (s) => s.delete(key));
      return;
    }
    const stored: StoredFile[] = files.map((file) => ({
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      blob: file,
    }));
    await run('readwrite', (s) => s.put(stored, key));
  } catch {
    // Not persisted: the files stay in memory for this page.
  }
}

export async function clearPendingFiles(key: string): Promise<void> {
  await savePendingFiles(key, []);
}

export async function clearAllPendingFiles(): Promise<void> {
  try {
    await run('readwrite', (s) => s.clear());
  } catch {
    // Nothing stored.
  }
}
