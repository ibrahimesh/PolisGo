import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from '../ui/icons';
import { isMac, paletteShortcutLabel, usePaletteShortcut } from './usePaletteShortcut';

// Loaded on first use (or when the button is hovered or focused): the
// palette's code isn't needed to render the page.
const loadPalette = () => import('./CommandPalette');
const CommandPalette = lazy(() => loadPalette().then((m) => ({ default: m.CommandPalette })));

// The compact search button, the Ctrl/⌘+K shortcut and the palette itself,
// shared by the public header and the cabinet header.
export function PaletteLauncher({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const show = useCallback(() => {
    onOpen?.();
    setMounted(true);
    setOpen(true);
  }, [onOpen]);
  usePaletteShortcut(show);
  const shortcut = paletteShortcutLabel();

  return (
    <>
      {/* "Search" is the visible label and the start of the accessible name
          (WCAG 2.5.3); the shortcut lives in the tooltip and inside the
          palette. Below sm only the icon shows. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={show}
        onPointerEnter={() => void loadPalette()}
        onFocus={() => void loadPalette()}
        aria-label={t('palette.open')}
        aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
        title={t('palette.openWithShortcut', { shortcut })}
        data-testid="palette-button"
        className="flex h-9 shrink-0 items-center gap-2 rounded-sm border border-line px-2.5 text-sm whitespace-nowrap text-muted transition-colors duration-(--duration-fast) hover:border-line-strong hover:text-text"
      >
        <SearchIcon />
        <span className="hidden sm:inline">{t('palette.search')}</span>
      </button>
      {mounted && (
        <Suspense fallback={null}>
          <CommandPalette open={open} onClose={() => setOpen(false)} returnFocusTo={buttonRef} />
        </Suspense>
      )}
    </>
  );
}
