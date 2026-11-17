import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { usePreferences, waitForPremium } from './helpers';
import type { Theme } from './helpers';

const PAGES = [
  { name: 'Landing', path: '/' },
  { name: 'Login', path: '/login' },
  { name: 'Register', path: '/register' },
];
const THEMES: Theme[] = ['dark', 'light'];

for (const { name, path } of PAGES) {
  for (const theme of THEMES) {
    test(`${name} has no serious or critical axe violations (${theme})`, async ({ page }) => {
      await usePreferences(page, { theme, lang: 'en' });
      await page.goto(path);
      if (path === '/') await waitForPremium(page);
      await page.evaluate(() => document.fonts.ready);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      const blocking = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          targets: v.nodes
            .slice(0, 5)
            .map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
        }));

      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
}
