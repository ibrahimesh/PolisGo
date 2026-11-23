import { expect, test } from '@playwright/test';
import { API_URL, openMobileMenu, seedPreferences } from './helpers';

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
      const panel = page.locator(`[id="${(await toggle.getAttribute('aria-controls')) ?? ''}"]`);

      await toggle.click();
      await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await panel.getByRole('link', { name: 'Questions' }).click();

      await expect(page).toHaveURL(/#faq$/);
      await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    // The open menu covers the page, so it acts as a modal: the page behind it
    // (footer included, which has its own Settings button) is inert, out of
    // the accessibility tree, and Tab wraps inside the header.
    test('while the menu is open the page behind it is unreachable', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('contentinfo').waitFor();
      const footerSettings = page
        .getByRole('contentinfo')
        .getByRole('button', { name: 'Settings' });
      await expect(footerSettings).toBeVisible();

      const menu = await openMobileMenu(page);
      await expect(page.locator('main')).toHaveJSProperty('inert', true);
      await expect(page.getByRole('contentinfo')).toHaveJSProperty('inert', true);

      // Chromium's own tree, as a screen reader gets it: one Settings button.
      const cdp = await page.context().newCDPSession(page);
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      const named = nodes.filter(
        (n) => !n.ignored && n.role?.value === 'button' && n.name?.value === 'Settings',
      );
      expect(named).toHaveLength(1);

      const outside: string[] = [];
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() =>
          document.activeElement?.closest('header')
            ? 'header'
            : (document.activeElement?.tagName ?? 'none'),
        );
        if (where !== 'header') outside.push(where);
      }
      expect(outside).toEqual([]);

      await menu.getByRole('link', { name: 'Coverage' }).focus();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
      await expect(page.getByRole('contentinfo')).toHaveJSProperty('inert', false);
      await footerSettings.click();
      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
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

// While a route's code loads, the shell must not show the footer under a
// short placeholder and then push it away: that one jump was a CLS of ~0.55
// on the landing page (Lighthouse calls anything over 0.25 poor).
test.describe('Layout stability', () => {
  for (const width of [1440, 390]) {
    test(`the landing and sign-in pages don't jump while they load (${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedPreferences(page, { lang: 'en' });
      for (const path of ['/', '/login']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const cls = await page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              let total = 0;
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries() as (PerformanceEntry & {
                  value: number;
                  hadRecentInput: boolean;
                })[]) {
                  if (!entry.hadRecentInput) total += entry.value;
                }
              }).observe({ type: 'layout-shift', buffered: true });
              setTimeout(() => resolve(total), 500);
            }),
        );
        expect(cls, `cumulative layout shift on ${path}`).toBeLessThan(0.1);
      }
    });
  }
});
