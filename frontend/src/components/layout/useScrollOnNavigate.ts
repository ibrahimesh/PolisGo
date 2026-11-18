import { useEffect } from 'react';
import { useLocation } from 'react-router';

const HASH_WAIT_MS = 3000;

// SPA navigations don't reset scroll; honour #hash targets, otherwise go to
// top. The target may live in a route chunk that hasn't rendered yet, so
// wait (briefly) for it to appear.
export function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const scroll = () => {
      const target = document.getElementById(id);
      target?.scrollIntoView();
      return target !== null;
    };
    if (scroll()) return;

    const observer = new MutationObserver(() => {
      if (scroll()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = setTimeout(() => observer.disconnect(), HASH_WAIT_MS);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [pathname, hash]);
}
