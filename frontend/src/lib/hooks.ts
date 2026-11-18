import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Compares by serialized value, so a structurally equal object (a fresh form
// snapshot on every render) doesn't restart the timer.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const serialized = JSON.stringify(value);
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(JSON.parse(serialized) as T), delayMs);
    return () => clearTimeout(timer);
  }, [serialized, delayMs]);

  return debounced;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

// Eases a list of numbers toward new targets. Under reduced motion the
// targets are returned as-is, so nothing animates.
export function useTweenedValues(target: readonly number[], durationMs = 260): readonly number[] {
  const reduced = usePrefersReducedMotion();
  const [current, setCurrent] = useState<readonly number[]>(target);
  const currentRef = useRef<readonly number[]>(target);
  const key = target.join('|');

  useEffect(() => {
    if (reduced) return;
    const to = key.split('|').map(Number);
    const from = currentRef.current;
    const start = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const next = to.map((value, i) => {
        const origin = from[i] ?? value;
        return origin + (value - origin) * eased;
      });
      currentRef.current = next;
      setCurrent(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key, durationMs, reduced]);

  return reduced || current.length !== target.length ? target : current;
}

// Runs one async task at a time; calls made while one is in flight are
// dropped. Guards submits in the gap between a click (or a held Enter) and the
// re-render that disables the button.
export function useExclusive() {
  const busy = useRef(false);
  return useCallback(async (task: () => Promise<void>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      await task();
    } finally {
      busy.current = false;
    }
  }, []);
}
