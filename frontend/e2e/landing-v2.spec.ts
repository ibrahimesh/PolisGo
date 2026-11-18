import { expect, test } from '@playwright/test';
import { API_URL, seedPreferences } from './helpers';

interface PolicyType {
  code: string;
  baseRate: number;
}

test.describe('Landing v2 sections', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en' });
  });

  test('coverage table and numbers come from the policy-types API', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/policy-types`);
    const types = ((await response.json()) as PolicyType[]).sort((a, b) => a.baseRate - b.baseRate);
    expect(types.length).toBeGreaterThan(0);

    await page.goto('/#coverage');
    const table = page.getByRole('table', { name: 'Coverage by product' });
    const headers = table.getByRole('columnheader');
    // First column is "Cover"; then one column per product, cheapest first.
    await expect(headers).toHaveCount(types.length + 1);
    for (const [index, type] of types.entries()) {
      await expect(headers.nth(index + 1)).toContainText(
        `from ${type.baseRate.toFixed(2)} AZN base rate`,
      );
    }
    await expect(table.getByRole('row', { name: /Injury to other people/ })).toContainText(
      'Included',
    );

    const numbers = page.getByRole('region', { name: 'The numbers behind every quote' });
    // <dt> label first, then the <dd> value (shown above it via CSS).
    await expect(numbers).toContainText(`products to choose from${types.length}`);
    await expect(numbers).toContainText(`lowest base rate, AZN${types[0]?.baseRate.toFixed(2)}`);
  });

  test('FAQ items open with mouse and keyboard', async ({ page }) => {
    await page.goto('/#faq');
    const first = page.locator('#faq details').first();
    await expect(first).not.toHaveAttribute('open');
    await first.locator('summary').click();
    await expect(first).toHaveAttribute('open');
    await expect(first).toContainText('indicative estimate');

    const second = page.locator('#faq details').nth(1);
    await second.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(second).toHaveAttribute('open');
  });

  test('command palette navigates and switches theme and language', async ({ page }) => {
    await page.goto('/');
    // Wait for the app to render so the shortcut listener is attached.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const dialog = page.getByRole('dialog', { name: 'Command palette' });

    await page.keyboard.press('Control+K');
    await expect(dialog).toBeVisible();
    // Scoped: the calculator's native <select> is also a combobox.
    await expect(dialog.getByRole('combobox')).toBeFocused();
    await page.keyboard.type('coverage');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#coverage$/);
    await expect(page.getByRole('heading', { name: 'What each policy covers.' })).toBeInViewport();

    await page.keyboard.press('Control+K');
    await page.keyboard.type('light');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: /Search and commands/ }).click();
    await page.keyboard.type('Рус');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the menu opens, links to sections and closes on navigation', async ({ page }) => {
      await page.goto('/');
      const toggle = page.getByRole('button', { name: 'Open menu' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await toggle.click();
      await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await page.getByRole('banner').getByRole('link', { name: 'Questions' }).click();

      await expect(page).toHaveURL(/#faq$/);
      await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    test('has no horizontal scroll', async ({ page }) => {
      await page.goto('/');
      await page.locator('#coverage table').waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  });
});
