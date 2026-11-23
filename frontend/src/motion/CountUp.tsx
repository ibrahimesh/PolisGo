import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../lib/hooks';
import { motionReduced } from '../settings/motion';

const DURATION_MS = 400;

// A key figure that counts up from zero when it first appears (and eases to
// a new value when it changes). Integers stay whole on the way; the text
// keeps tabular figures, so nothing around it moves. Reduced motion shows
// the value at once.
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(() => (motionReduced() ? value : 0));
  const current = useRef(display);

  useEffect(() => {
    if (reduced) return;
    const from = current.current;
    const whole = Number.isInteger(value);
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      const next = progress === 1 ? value : from + (value - from) * eased;
      current.current = next;
      setDisplay(whole ? Math.round(next) : next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return <>{format(reduced ? value : display)}</>;
}
