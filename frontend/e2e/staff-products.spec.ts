import { expect, test } from '@playwright/test';
import { adminApi, API_URL, expectNoAxeViolations, openSession, seedPreferences } from './helpers';

// Products and rates: every product the API serves has a visible mark, in
// the accent colour, in both themes; the page passes axe.
for (const theme of ['dark', 'light'] as const) {
  test(`every product shows its icon (${theme})`, async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme });
    const types = (await (await page.request.get(`${API_URL}/api/policy-types`)).json()) as {
      code: string;
    }[];
    const admin = await (await adminApi(page)).createStaff('Admin');
    await openSession(page, admin.session);
    await page.goto('/app/admin/policy-types');
    await expect(page.getByRole('heading', { level: 1, name: 'Products and rates' })).toBeVisible();

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--pg-accent').trim(),
    );
    for (const { code } of types) {
      const icon = page.locator(`[data-product-icon="${code}"]`).locator('visible=true');
      await expect(icon).toHaveCount(1);
      const box = await icon.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(20);
      const color = await icon.evaluate((el) => getComputedStyle(el).color);
      // rgb() of the theme's accent token.
      const hex = color
        .match(/\d+/g)
        ?.slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('');
      expect(`#${hex}`).toBe(accent.toLowerCase());
    }
    await expectNoAxeViolations(page);
  });
}
