import { useEffect } from 'react';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Ctrl+K / ⌘K opens the command palette from anywhere in the layout that
// mounts this; Escape is forwarded for menus that close on it.
export function usePaletteShortcut(onOpen: () => void, onEscape?: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
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
