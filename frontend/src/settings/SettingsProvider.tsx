import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { SettingsFields } from './SettingsFields';

interface SettingsContextValue {
  openSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

// One Settings dialog for the whole app. The user menu, the command palette,
// the public footer and the mobile menu open it; the profile page shows the
// same fields inline.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const openSettings = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openSettings }), [openSettings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('settings.title')}
        footer={<Button onClick={() => setOpen(false)}>{t('settings.done')}</Button>}
      >
        {open && <SettingsFields />}
      </Modal>
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>.');
  return context;
}
