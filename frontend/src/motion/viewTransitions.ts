import { flushSync } from 'react-dom';
import { UNSAFE_createBrowserHistory as createBrowserHistory } from 'react-router';
import { motionReduced } from '../settings/motion';

// Page transitions with the View Transitions API. The router listens to this
// history; a change of pathname (not a search or hash change: filters and
// in-page links stay instant) runs inside document.startViewTransition, which
// keeps the old frame until the new route has committed (ViewTransitionCommit
// resolves it), or 1s at most. Browsers without the API, and anyone with
// reduced motion, get the plain update; the shells add a CSS fade instead.

interface ViewTransitionDocument {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
}

export function supportsViewTransitions(): boolean {
  return typeof (document as ViewTransitionDocument).startViewTransition === 'function';
}

function start(update: () => Promise<void> | void, kind: 'page' | 'theme') {
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || motionReduced()) {
    void update();
    return;
  }
  document.documentElement.dataset.vt = kind;
  const transition = doc.startViewTransition(update);
  void transition.finished.finally(() => {
    delete document.documentElement.dataset.vt;
  });
}

let pending: { key: string; resolve: () => void } | null = null;

export function createTransitionHistory() {
  const history = createBrowserHistory({ v5Compat: true });
  const listen = history.listen.bind(history);
  let pathname = history.location.pathname;
  history.listen = (listener) =>
    listen((update) => {
      const changed = update.location.pathname !== pathname;
      pathname = update.location.pathname;
      if (!changed) {
        listener(update);
        return;
      }
      start(
        () =>
          new Promise<void>((resolve) => {
            pending = { key: update.location.key, resolve };
            listener(update);
            setTimeout(resolve, 1000);
          }),
        'page',
      );
    });
  return history;
}

// Called from a layout effect once the router has rendered a location.
export function settleViewTransition(locationKey: string) {
  if (pending && pending.key === locationKey) {
    pending.resolve();
    pending = null;
  }
}

// Theme changes crossfade the whole page (old and new snapshots).
export function withThemeTransition(apply: () => void) {
  start(() => flushSync(apply), 'theme');
}
