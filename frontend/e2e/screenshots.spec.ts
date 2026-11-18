import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  cabinetApi,
  randomUser,
  uniqueVehicle,
  registerSession,
  usePreferences,
  useSession,
  waitForPremium,
} from './helpers';
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
  if (path === '/') {
    await waitForPremium(page);
    await page.locator('#coverage table').waitFor();
  }
  await page.evaluate(() => document.fonts.ready);
  // Let the price tween and toast-free UI come to rest.
  await page.waitForTimeout(400);
}

for (const size of SIZES) {
  test.describe(`${size.label} @screenshots`, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: 2 });

    for (const shot of SHOTS) {
      test(`${shot.file}-${size.label}`, async ({ page }) => {
        // A full-page capture never scrolls, so the scroll reveal would leave
        // lower sections blank; reduced motion shows everything at once.
        await page.emulateMedia({ reducedMotion: 'reduce' });
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

/* ---------- Client cabinet: first screen only ---------- */

const CABINET_PAGES = ['overview', 'policies', 'policy', 'buy', 'profile'] as const;
const THEMES: Theme[] = ['dark', 'light'];

// One client with real data behind every page: an active policy, one that
// ends inside the 30-day reminder window, and an unpaid draft.
async function seedClient(page: Page) {
  const { session } = await registerSession(page, { ...randomUser(), fullName: 'Leyla Məmmədova' });
  const api = cabinetApi(page, session);
  const { policy } = await api.activePolicy(12, 'MTPL');
  await api.activePolicy(1, 'CASCO');
  // Sorts first by plate, so the wizard preselects it; it has only a CASCO
  // draft, so MTPL prices without an overlap.
  const spare = await api.vehicle({
    ...uniqueVehicle(),
    // Random digits: parallel workers run this at the same millisecond.
    plateNumber: `10-AA-${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
  });
  await api.policy(spare.id, 'CASCO', 6);
  return { session, policyId: policy.id };
}

for (const size of SIZES) {
  test.describe(`cabinet ${size.label} @screenshots`, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: 2 });

    for (const theme of THEMES) {
      test(`cabinet-${theme}-${size.label}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const { session, policyId } = await seedClient(page);
        await usePreferences(page, { theme, lang: 'en' });
        await useSession(page, session);

        const paths: Record<(typeof CABINET_PAGES)[number], string> = {
          overview: '/app',
          policies: '/app/policies',
          policy: `/app/policies/${policyId}`,
          buy: '/app/buy',
          profile: '/app/profile',
        };
        for (const name of CABINET_PAGES) {
          await page.goto(paths[name]);
          if (name === 'overview')
            await page.getByText('Active policies', { exact: true }).waitFor();
          if (name === 'policies') await page.getByText('3 policies', { exact: true }).waitFor();
          if (name === 'policy')
            await page.getByRole('heading', { name: 'Status history' }).waitFor();
          if (name === 'buy') {
            await page.getByRole('radio', { name: /^MTPL/ }).check();
            await page.getByText(/^Your premium: /).waitFor({ state: 'attached', timeout: 15_000 });
          }
          if (name === 'profile') await page.getByLabel('Full name').waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(400);
          await page.screenshot({
            path: `docs/screenshots/cabinet-${name}-${theme}-${size.label}.png`,
            animations: 'disabled',
          });
        }
      });
    }
  });
}
