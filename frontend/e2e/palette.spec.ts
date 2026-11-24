import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  adminApi,
  expectNoAxeViolations,
  openSession,
  registerSession,
  seedPreferences,
} from './helpers';

// The Ctrl/⌘+K palette, driven by the keyboard alone.

function palette(page: Page) {
  return page.getByRole('dialog', { name: 'Command palette' });
}

async function openWithShortcut(page: Page) {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole('combobox')).toBeFocused();
}

// The active option (aria-activedescendant) is fully inside the list's box.
async function expectActiveInView(page: Page) {
  const combobox = palette(page).getByRole('combobox');
  const activeId = await combobox.getAttribute('aria-activedescendant');
  expect(activeId).toBeTruthy();
  const option = page.locator(`[id="${activeId}"]`);
  await expect(option).toHaveAttribute('aria-selected', 'true');
  const list = palette(page).getByRole('listbox');
  const [o, l] = await Promise.all([option.boundingBox(), list.boundingBox()]);
  expect(o && l, 'boxes').toBeTruthy();
  if (!o || !l) return;
  expect(o.y).toBeGreaterThanOrEqual(l.y - 1);
  expect(o.y + o.height).toBeLessThanOrEqual(l.y + l.height + 1);
}

async function activeLabel(page: Page, combobox: Locator) {
  const id = await combobox.getAttribute('aria-activedescendant');
  return (await page.locator(`[id="${id}"]`).textContent())?.trim();
}

test.describe('Command palette', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
  });

  test('opens, filters with fuzzy matching and Enter navigates', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await openWithShortcut(page);
    await page.keyboard.type('cvrg');
    const first = palette(page).getByRole('option').first();
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(first).toContainText('Coverage');
    // Matched letters are marked.
    await expect(first.locator('mark')).toHaveCount(4);
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/#coverage$/);
  });

  test('Esc closes it and focus returns to the search button', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('banner').getByRole('button', { name: /Search and commands/ });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeVisible();
    // Tab can't leave the palette.
    await page.keyboard.press('Tab');
    await expect(palette(page).getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(button).toBeFocused();
  });

  test('the search button says "Search"; the shortcut is in its tooltip and the palette', async ({
    page,
  }) => {
    for (const [lang, word, name] of [
      ['en', 'Search', 'Search and commands'],
      ['ru', 'Поиск', 'Поиск и команды'],
      ['az', 'Axtarış', 'Axtarış və əmrlər'],
    ] as const) {
      await seedPreferences(page, { lang }, { override: true });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      const button = page.getByRole('banner').getByRole('button', { name });
      await expect(button).toHaveText(word);
      await expect(button).toHaveAttribute('title', new RegExp(`${name} \\(Ctrl K\\)`));
      await expect(button.locator('kbd')).toHaveCount(0);

      // A phone shows the icon alone; the accessible name stays.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(button).toBeVisible();
      await expect(button.getByText(word)).toBeHidden();
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press('Control+K');
    const dialog = page.getByRole('dialog', { name: 'Əmrlər paneli' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('kbd', { hasText: /^Ctrl K$/ })).toBeVisible();
  });

  test('arrowing past the visible area keeps the active item in view', async ({ page }) => {
    const admin = await (await adminApi(page)).createStaff('Admin');
    await openSession(page, admin.session);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await openWithShortcut(page);
    const combobox = palette(page).getByRole('combobox');
    const options = palette(page).getByRole('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(12);

    for (let i = 0; i < count - 1; i++) {
      await page.keyboard.press('ArrowDown');
      await expectActiveInView(page);
    }
    await page.keyboard.press('Home');
    await expectActiveInView(page);
    expect(await activeLabel(page, combobox)).toBe(await options.first().textContent());
    await page.keyboard.press('End');
    await expectActiveInView(page);
    await page.keyboard.press('PageUp');
    await expectActiveInView(page);
    await page.keyboard.press('PageDown');
    await expectActiveInView(page);
    // Down from the last wraps to the first.
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('staff see their desks; the hovered option becomes active', async ({ page }) => {
    const admin = await (await adminApi(page)).createStaff('Admin');
    await openSession(page, admin.session);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await openWithShortcut(page);
    const audit = palette(page).getByRole('option', { name: 'Audit log' });
    await expect(audit).toBeVisible();
    await expect(palette(page).getByRole('option', { name: 'Buy a policy' })).toHaveCount(0);
    await audit.hover();
    await expect(audit).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/admin\/audit$/);
  });

  test('shows an empty state, remembers recent commands and runs actions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await openWithShortcut(page);
    await page.keyboard.type('qqqzzz');
    await expect(palette(page).getByRole('status')).toContainText('Nothing matches “qqqzzz”.');
    await expect(palette(page).getByRole('option')).toHaveCount(0);

    await page.keyboard.press('Control+A');
    await page.keyboard.type('faq');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#faq$/);

    await openWithShortcut(page);
    const recent = palette(page).getByRole('group', { name: 'Recent' });
    await expect(recent.getByRole('option')).toHaveCount(1);
    await expect(recent.getByRole('option', { name: 'Questions' })).toBeVisible();
    // Shortcut hints are shown.
    await expect(palette(page).locator('kbd', { hasText: /^Home$/ })).toBeVisible();

    await page.keyboard.type('settings');
    await expect(palette(page).getByRole('option').first()).toContainText('Open settings');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`passes axe while open (${theme})`, async ({ page }) => {
      await seedPreferences(page, { theme }, { override: true });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await openWithShortcut(page);
      await page.keyboard.type('a');
      await expectNoAxeViolations(page);
    });
  }

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('fits and signs out from the palette', async ({ page }) => {
      const { session } = await registerSession(page);
      await openSession(page, session);
      await page.goto('/app');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.getByRole('button', { name: /Search and commands/ }).click();
      await expect(palette(page)).toBeVisible();
      const box = await palette(page).boundingBox();
      expect(box?.width).toBeLessThanOrEqual(390);
      await page.keyboard.type('sign out');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Insurance, priced in the open.',
      );
      expect(await page.evaluate(() => sessionStorage.getItem('polisgo.session'))).toBeNull();
    });
  });
});
