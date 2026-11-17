import '@testing-library/jest-dom/vitest';
import i18n from '../i18n';

// jsdom has no matchMedia; theme and reduced-motion hooks need one. Report
// reduced motion so tweens resolve instantly and assertions see final values.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  sessionStorage.clear();
  localStorage.clear();
});
