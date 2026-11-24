import { useEffect } from 'react';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// How the shortcut is written in the search button's tooltip and the palette.
export function paletteShortcutLabel() {
  return isMac ? '⌘K' : 'Ctrl K';
}

// Ctrl+K / ⌘K opens the command palette from anywhere in the layout that
// mounts this; Escape is forwarded for menus that close on it.
export function usePaletteShortcut(onOpen?: () => void, onEscape?: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (onOpen && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpen();
      } else if (event.key === 'Escape') {
        onEscape?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen, onEscape]);
}
