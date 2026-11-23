import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, seedPreferences } from './helpers';

// Public error pages. /__e2e/crash exists only on the e2e dev server
// (VITE_E2E_ROUTES=true, set in playwright.config.ts).
test.describe('Error pages', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
  });

  test('the route error boundary keeps the shell and shows no internals', async ({ page }) => {
    await page.goto('/__e2e/crash');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Something broke on our side.');
    // The header (and its way home) survive the crash.
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'PolisGo — home' }),
    ).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/\bat .+\(.+:\d+:\d+\)/);
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expectNoAxeViolations(page);

    // Keyboard only: reach "Home page" and go.
    const home = page.getByRole('link', { name: 'Home page' });
    for (let i = 0; i < 30 && !(await home.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(home).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Insurance, priced in the open.',
    );
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`the 404 page passes axe and Back works from the keyboard (${theme})`, async ({
      page,
    }) => {
      await seedPreferences(page, { theme }, { override: true });
      await page.goto('/login');
      await page.goto('/no-such-page');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing is insured here.');
      await expect(page.locator('[data-glyph="notFound"]')).toBeVisible();
      await expectNoAxeViolations(page);
      await page.getByRole('button', { name: 'Back' }).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});
