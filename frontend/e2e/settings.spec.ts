import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, seedPreferences } from './helpers';

// Language, theme and motion moved from the header into one Settings dialog.
test.describe('Settings', () => {
  test.describe('first visit', () => {
    test.use({ locale: 'az-AZ' });

    test('picks the language from the browser and remembers it', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', 'az');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sığorta, açıq qiymətlə.');
      expect(await page.evaluate(() => localStorage.getItem('polisgo.lang'))).toBe('az');
    });
  });

  test('the public header has no language or theme switchers', async ({ page }) => {
    await seedPreferences(page, { lang: 'en' });
    await page.goto('/');
    const banner = page.getByRole('banner');
    await expect(banner.getByRole('radio')).toHaveCount(0);
    await expect(banner.getByRole('group')).toHaveCount(0);
  });

  test('opens from the footer and works with the keyboard alone', async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
    await page.goto('/');
    const opener = page.getByRole('contentinfo').getByRole('button', { name: 'Settings' });
    await opener.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    // Appearance first: Light, Dark, System. Tab reaches the checked radio;
    // arrows move the choice as in any radio group.
    await dialog.getByRole('radio', { name: 'Dark' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNoAxeViolations(page);

    await dialog.getByRole('checkbox', { name: 'Reduce motion' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    // Remembered on this device.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  });

  test('passes axe in the dark theme', async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the mobile menu opens Settings and the dialog fits', async ({ page }) => {
      await seedPreferences(page, { lang: 'ru' });
      await page.goto('/');
      await page.getByRole('button', { name: 'Открыть меню' }).click();
      await page.getByRole('button', { name: 'Настройки' }).click();
      const dialog = page.getByRole('dialog', { name: 'Настройки' });
      await expect(dialog).toBeVisible();
      await dialog.getByText('Azərbaycanca').click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'az');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  });
});
