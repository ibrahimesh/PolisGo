import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from '../ui/icons';
import { CommandPalette } from './CommandPalette';
import { isMac, usePaletteShortcut } from './usePaletteShortcut';

// The compact search button, the Ctrl/⌘+K shortcut and the palette itself,
// shared by the public header and the cabinet header.
export function PaletteLauncher({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const show = useCallback(() => {
    onOpen?.();
    setOpen(true);
  }, [onOpen]);
  usePaletteShortcut(show);
  const shortcut = isMac ? '⌘K' : 'Ctrl K';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={show}
        aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
        data-testid="palette-button"
        className="flex h-9 shrink-0 items-center gap-2 rounded-sm border border-line px-2.5 text-sm whitespace-nowrap text-muted transition-colors duration-(--duration-fast) hover:border-line-strong hover:text-text"
      >
        <SearchIcon />
        {/* Visible shortcut text must be part of the accessible name (WCAG 2.5.3). */}
        <span className="sr-only">{t('palette.open')}</span>
        <kbd className="hidden rounded-sm bg-surface-2 px-1.5 font-sans leading-6 sm:inline">
          {shortcut}
        </kbd>
      </button>
      <CommandPalette open={open} onClose={() => setOpen(false)} returnFocusTo={buttonRef} />
    </>
  );
}
