import { expect, test } from '@playwright/test';
import { openSession, registerSession, seedPreferences } from './helpers';

// The logo is the way home in both shells: the sidebar's (desktop) or the
// cabinet header's (phones) and the public header's all go to the landing page.
test.describe('Logo', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en' });
  });

  test('the cabinet logo returns to the landing page, by keyboard too', async ({ page }) => {
    const { session } = await registerSession(page);
    await openSession(page, session);
    await page.goto('/app/profile');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const logo = page.getByRole('link', { name: 'PolisGo — home' }).locator('visible=true');
    await expect(logo).toHaveCount(1);
    await expect(logo).toHaveAttribute('href', '/');
    await logo.focus();
    // The focus ring is drawn (an outline), not only the browser default.
    await expect(logo).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Insurance, priced in the open.',
    );
  });

  test('the public logo returns to the landing page from another page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('banner').getByRole('link', { name: 'PolisGo — home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
