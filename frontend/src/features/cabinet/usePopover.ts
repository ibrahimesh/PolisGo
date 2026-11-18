import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';

// Disclosure popover (WAI-ARIA disclosure, not a menu): a button with
// aria-expanded controlling a panel of ordinary links and controls, so Tab
// works as usual. Closes on Escape (focus returns to the button), on a click
// outside, and on navigation.
export function usePopover() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { pathname } = useLocation();

  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return {
    open,
    close,
    toggle: () => setOpen((value) => !value),
    buttonProps: {
      ref: buttonRef,
      'aria-expanded': open,
      'aria-controls': panelId,
    },
    panelProps: {
      ref: panelRef,
      id: panelId,
      hidden: !open,
    },
  };
}
