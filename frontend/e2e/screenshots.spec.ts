import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { usePreferences, waitForPremium } from './helpers';
import type { Theme } from './helpers';

// Regenerates docs/screenshots. Tagged so the regular e2e run skips it:
//   npm run e2e:screenshots

const SIZES = [
  { label: 'desktop', viewport: { width: 1440, height: 900 } },
  { label: 'mobile', viewport: { width: 390, height: 844 } },
] as const;

const SHOTS: { file: string; path: string; theme: Theme }[] = [
  { file: 'landing-dark', path: '/', theme: 'dark' },
  { file: 'landing-light', path: '/', theme: 'light' },
  { file: 'register', path: '/register', theme: 'dark' },
  { file: 'login', path: '/login', theme: 'dark' },
];

async function settle(page: Page, path: string) {
  if (path === '/') await waitForPremium(page);
  await page.evaluate(() => document.fonts.ready);
  // Let the price tween and toast-free UI come to rest.
  await page.waitForTimeout(400);
}

for (const size of SIZES) {
  test.describe(`${size.label} @screenshots`, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: 2 });

    for (const shot of SHOTS) {
      test(`${shot.file}-${size.label}`, async ({ page }) => {
        await usePreferences(page, { theme: shot.theme, lang: 'en' });
        await page.goto(shot.path);
        await settle(page, shot.path);
        await page.screenshot({
          path: `docs/screenshots/${shot.file}-${size.label}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      });
    }
  });
}
