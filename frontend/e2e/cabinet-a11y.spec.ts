import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminApi,
  cabinetApi,
  claimsApi,
  FILES,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  registerSession,
  seedPreferences,
  openSession,
  openUserMenu,
  waitForSettled,
} from './helpers';
import type { Theme } from './helpers';

// Every cabinet page, in both themes: no serious or critical axe violations,
// and nothing wider than the viewport (the mobile project runs this at 390px).
const THEMES: Theme[] = ['dark', 'light'];

for (const theme of THEMES) {
  test(`cabinet pages pass axe and fit the viewport (${theme})`, async ({ page }) => {
    const { session } = await registerSession(page);
    const api = cabinetApi(page, session);
    // A 1-month policy ends inside the reminder window, so the overview,
    // the bell and the detail page all have real content to check.
    const { policy } = await api.activePolicy(1, 'MTPL');
    // A claim under review with a photo: timeline, documents and the
    // uploader all render, and withdraw is still allowed.
    const claim = await claimsApi(page, session).file(policy.id);
    await claimsApi(page, session).upload(claim.id, 'front.png', FILES.png);
    await (await adminApi(page)).act(claim.id, 'review', { comment: 'Looking at the photos.' });
    await seedPreferences(page, { theme, lang: 'en' });
    await openSession(page, session);

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
        path: '/app/claims',
        ready: (p) => expect(p.getByText('1 claim', { exact: true })).toBeVisible(),
      },
      {
        path: `/app/claims/${claim.id}`,
        ready: (p) => expect(p.getByRole('heading', { name: 'History' })).toBeVisible(),
      },
      {
        path: '/app/claims/new',
        ready: (p) =>
          expect(p.getByRole('heading', { name: 'Which policy is the claim for?' })).toBeVisible(),
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
        await expectNoAxeViolations(page);
      });
    }

    await test.step('wizard with an error summary', async () => {
      await page.goto('/app/buy');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByTestId('error-summary')).toBeVisible();
      await expectNoAxeViolations(page);
    });

    await test.step('claim wizard with an error summary', async () => {
      await page.goto('/app/claims/new');
      await page.getByRole('radio', { name: /MTPL/ }).first().check();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByTestId('error-summary')).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });

    await test.step('withdraw dialog open', async () => {
      await page.goto(`/app/claims/${claim.id}`);
      await page.getByRole('button', { name: 'Withdraw claim' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoAxeViolations(page);
      await page.keyboard.press('Escape');
    });

    await test.step('notifications panel and user menu open', async () => {
      await page.goto('/app');
      await page.getByRole('button', { name: /^Notifications/ }).click();
      await expect(page.getByRole('region', { name: 'Updates', exact: true })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
      await page.keyboard.press('Escape');
      const menu = await openUserMenu(page);
      await expect(menu.getByRole('button', { name: 'Sign out' })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
}

// The axe helper scans a settled page, not just a quiet one. The overview's
// data arrives after the bell panel has opened (as on a slow runner): the
// activity rows start fading in only then, and a scan taken in that fade reads
// the text at 20% opacity (contrast 1.5). Motion stays ON for this scan; the
// rows' stagger is the thing being waited for.
test('axe waits for a late overview and scans it with motion on', async ({ page }) => {
  const { session } = await registerSession(page);
  await cabinetApi(page, session).activePolicy(1, 'MTPL');
  await seedPreferences(page, { theme: 'light', lang: 'en' });
  await openSession(page, session);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/me/overview', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/app');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('region', { name: 'Updates', exact: true })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-motion', 'reduce');
  // Still a skeleton: nothing but the panel has animated so far.
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.getByText('Active policies', { exact: true })).toHaveCount(0);

  release();
  await waitForSettled(page);
  const row = page.locator('ol.stagger > li').first();
  await expect(row).toBeVisible();
  expect(await row.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity,
          ).length,
    ),
  ).toBe(0);
  await expectNoAxeViolations(page);
});
