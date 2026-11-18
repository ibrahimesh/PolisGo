import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  cabinetApi,
  expectNoHorizontalScroll,
  registerSession,
  usePreferences,
  useSession,
} from './helpers';
import type { Theme } from './helpers';

// Every cabinet page, in both themes: no serious or critical axe violations,
// and nothing wider than the viewport (the mobile project runs this at 390px).
const THEMES: Theme[] = ['dark', 'light'];

async function expectAccessible(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
    }));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

for (const theme of THEMES) {
  test(`cabinet pages pass axe and fit the viewport (${theme})`, async ({ page }) => {
    const { session } = await registerSession(page);
    const api = cabinetApi(page, session);
    // A 1-month policy ends inside the reminder window, so the overview,
    // the bell and the detail page all have real content to check.
    const { policy } = await api.activePolicy(1, 'MTPL');
    await usePreferences(page, { theme, lang: 'en' });
    await useSession(page, session);

    const pages: { path: string; ready: (p: Page) => Promise<void> }[] = [
      {
        path: '/app',
        ready: (p) => expect(p.getByText('Active policies', { exact: true })).toBeVisible(),
      },
      {
        path: '/app/policies',
        ready: (p) => expect(p.getByText('1 policy', { exact: true })).toBeVisible(),
      },
      {
        path: `/app/policies/${policy.id}`,
        ready: (p) => expect(p.getByRole('heading', { name: 'Status history' })).toBeVisible(),
      },
      {
        path: '/app/buy',
        ready: (p) =>
          expect(p.getByRole('heading', { name: 'What would you like to insure?' })).toBeVisible(),
      },
      {
        path: '/app/profile',
        ready: (p) => expect(p.getByRole('heading', { name: 'Personal details' })).toBeVisible(),
      },
      {
        path: '/app/help',
        ready: (p) => expect(p.getByRole('heading', { name: 'Buying a policy' })).toBeVisible(),
      },
    ];

    for (const { path, ready } of pages) {
      await test.step(path, async () => {
        await page.goto(path);
        await ready(page);
        await expectNoHorizontalScroll(page);
        await expectAccessible(page);
      });
    }

    await test.step('wizard with an error summary', async () => {
      await page.goto('/app/buy');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByTestId('error-summary')).toBeVisible();
      await expectAccessible(page);
    });

    await test.step('notifications panel and user menu open', async () => {
      await page.goto('/app');
      await page.getByRole('button', { name: /^Notifications/ }).click();
      await expect(page.getByRole('region', { name: 'Reminders', exact: true })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /, account menu$/ }).click();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
      await expectAccessible(page);
    });
  });
}
