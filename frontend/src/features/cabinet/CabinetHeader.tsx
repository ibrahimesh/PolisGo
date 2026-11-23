import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommandPalette } from '../../components/layout/CommandPalette';
import { isMac, usePaletteShortcut } from '../../components/layout/usePaletteShortcut';
import { LogoLink } from '../../components/layout/Wordmark';
import { SearchIcon } from '../../components/ui/icons';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { UserMenu } from './UserMenu';

// Top bar of the signed-in area. The wordmark lives in the sidebar on
// desktop, so here it only shows on smaller screens.
export function CabinetHeader({ notifications }: { notifications?: ReactNode }) {
  const { t } = useTranslation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  usePaletteShortcut(useCallback(() => setPaletteOpen(true), []));

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-10">
        <LogoLink className="lg:hidden" />

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            className="flex h-9 items-center gap-2 rounded-sm border border-line px-3 text-sm text-muted transition-colors hover:text-text"
          >
            <SearchIcon />
            <span className="sr-only">{t('palette.open')}</span>
            <kbd className="hidden font-sans sm:inline">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>

          {notifications}

          <div
            role="group"
            aria-label={t('nav.settings')}
            className="hidden items-center gap-2 xl:flex"
          >
            <LanguageSwitcher />
            <ThemeToggle />
          </div>

          <UserMenu />
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
