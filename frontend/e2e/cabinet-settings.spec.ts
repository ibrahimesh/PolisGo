import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, openSession, registerSession, seedPreferences } from './helpers';

// In the cabinet, Settings opens from the user menu; the profile page shows
// the same fields, so a choice made in one place shows in the other.
test('the user menu and the profile page share one set of settings', async ({ page }) => {
  await seedPreferences(page, { lang: 'en', theme: 'dark' });
  const { session, user } = await registerSession(page);
  await openSession(page, session);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The cabinet header carries no switchers either.
  await expect(page.getByRole('banner').getByRole('radio')).toHaveCount(0);

  await page.getByRole('button', { name: `${user.fullName}, account menu` }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  // Its title follows the language chosen inside it.
  const dialog = page.getByRole('dialog', { name: /^(Settings|Настройки)$/ });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByText('Light', { exact: true }).click();
  await dialog.getByText('Русский', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Готово' }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/app/profile');
  const fields = page.locator('#preferences-title').locator('xpath=ancestor::section[1]');
  await expect(fields.getByRole('radio', { name: 'Светлая' })).toBeChecked();
  await expect(fields.getByRole('radio', { name: 'Русский' })).toBeChecked();
  await fields.getByText('Тёмная', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
