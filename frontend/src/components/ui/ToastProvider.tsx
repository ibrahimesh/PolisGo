import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './cx';
import { AlertIcon, CheckIcon, CloseIcon } from './icons';

type ToastTone = 'info' | 'success' | 'error';

export interface ToastInput {
  // Already-translated text; callers own the wording.
  title: string;
  description?: string;
  traceId?: string | undefined;
  tone?: ToastTone;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    // Cap the stack so a burst of errors can't bury the page.
    setItems((current) => [...current.slice(-2), { ...input, id }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('common.notifications')}
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {items.map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </section>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  const tone = item.tone ?? 'info';

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex animate-toast-in gap-3 rounded-sm border border-line bg-surface p-4 shadow-[0_16px_40px_-20px_rgb(0_0_0/0.6)]"
    >
      <span
        className={cx(
          'mt-0.5',
          tone === 'error' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-accent',
        )}
      >
        {tone === 'success' ? <CheckIcon /> : <AlertIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        {item.description && <p className="mt-1 text-sm text-muted">{item.description}</p>}
        {item.traceId && (
          <p className="mt-2 label-mono break-all text-muted">
            {t('errors.reference')}: <span className="normal-case">{item.traceId}</span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={t('common.dismiss')}
        className="-m-1 grid size-7 shrink-0 place-items-center rounded-sm text-muted hover:text-text"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
