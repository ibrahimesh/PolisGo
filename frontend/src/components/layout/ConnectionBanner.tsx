import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertIcon } from '../ui/icons';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

// A quiet strip while the browser is offline: pages already open keep
// working, new ones and saves will fail until the connection returns.
export function ConnectionBanner() {
  const { t } = useTranslation();
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <div role="status" aria-live="polite">
      {!online && (
        <p className="flex animate-notice-in items-center justify-center gap-2 border-b border-warning/60 bg-bg px-4 py-2 text-sm text-text">
          <span className="text-warning">
            <AlertIcon />
          </span>
          {t('connection.offline')}
        </p>
      )}
    </div>
  );
}
