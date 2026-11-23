import { expect, test } from '@playwright/test';
import { adminApi, openSession, seedPreferences } from './helpers';

// Count-ups land on the real figures, lists stagger in, and the sidebar's
// active rule slides to the current section.
test('dashboard figures count up to the API totals', async ({ page }) => {
  await seedPreferences(page, { lang: 'en' });
  const admin = await (await adminApi(page)).createStaff('Admin');
  await openSession(page, admin.session);
  const dashboard = page.waitForResponse((r) => r.url().includes('/api/admin/dashboard'));
  await page.goto('/app');
  const body = (await (await dashboard).json()) as { totals: { policiesIssued: number } };
  const tile = page.locator('dl > div', { hasText: 'Policies issued' }).locator('dd').first();
  await expect(tile).toHaveText(new Intl.NumberFormat('en-GB').format(body.totals.policiesIssued));
  // The grid's tiles rise in one after another.
  const delays = await page
    .locator('dl.stagger > div')
    .evaluateAll((tiles) => tiles.map((t) => getComputedStyle(t).animationDelay));
  expect(new Set(delays).size).toBeGreaterThan(1);
});

test('the sidebar rule slides to the active section', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'The sidebar is a desktop element.');
  await seedPreferences(page, { lang: 'en' });
  const admin = await (await adminApi(page)).createStaff('Admin');
  await openSession(page, admin.session);
  await page.goto('/app');
  const nav = page.getByRole('navigation', { name: 'Your account' });
  const rule = page.getByTestId('sidebar-rule');

  for (const name of ['Audit log', 'Products and rates', 'Overview']) {
    await nav.getByRole('link', { name }).click();
    const link = nav.getByRole('link', { name });
    await expect(link).toHaveAttribute('aria-current', 'page');
    const expected = await link.evaluate((el) => (el as HTMLElement).offsetTop + 8);
    await expect
      .poll(() => rule.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))
      .toBe(expected);
  }
  // The sliding rule replaces each item's own rule once it is in place.
  const own = await nav
    .getByRole('link', { name: 'Overview' })
    .evaluate((el) => getComputedStyle(el, '::before').display);
  expect(own).toBe('none');
});
