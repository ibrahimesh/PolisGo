import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../lib/hooks';
import { cx } from '../ui/cx';

// Fades content up the first time it scrolls into view. Visible by default:
// only off-screen elements, with motion allowed, are opted into the effect,
// so reduced-motion users, no-JS, tests and screenshots always see content.
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element || reduced || typeof IntersectionObserver === 'undefined') return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    element.dataset.reveal = 'pending';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          element.dataset.reveal = 'shown';
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      element.dataset.reveal = 'shown';
    };
  }, [reduced]);

  return (
    <div ref={ref} className={cx('reveal', className)}>
      {children}
    </div>
  );
}
