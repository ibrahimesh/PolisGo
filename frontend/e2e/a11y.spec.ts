import { test } from '@playwright/test';
import { expectNoAxeViolations, seedPreferences, waitForPremium } from './helpers';
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
      await seedPreferences(page, { theme, lang: 'en' });
      await page.goto(path);
      if (path === '/') await waitForPremium(page);
      await expectNoAxeViolations(page);
    });
  }
}
