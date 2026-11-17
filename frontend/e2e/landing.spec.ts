import { expect, test } from '@playwright/test';
import { chooseSegment, premiumText, quoteBody, usePreferences, waitForPremium } from './helpers';

test.describe('Landing', () => {
  test('loads in the dark theme by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Insurance, priced in the open.' }),
    ).toBeVisible();
    await expect(page.getByText('Operational')).toBeVisible();
    await waitForPremium(page);
  });

  test('switches to light and keeps it after a reload', async ({ page }) => {
    await page.goto('/');
    await chooseSegment(page, 'Light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(217, 214, 207)'); // warm stone #D9D6CF

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('switches language between EN, RU and AZ', async ({ page }) => {
    await usePreferences(page, { lang: 'en' });
    await page.goto('/');
    const h1 = page.getByRole('heading', { level: 1 });

    await chooseSegment(page, 'Русский');
    await expect(h1).toHaveText('Страхование с открытой ценой.');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('banner').getByRole('link', { name: 'Войти' })).toBeVisible();

    await chooseSegment(page, 'Azərbaycanca');
    await expect(h1).toHaveText('Sığorta, açıq qiymətlə.');
    await expect(page.locator('html')).toHaveAttribute('lang', 'az');
    await expect(page.getByText('Mühərrikin həcmi', { exact: true })).toBeVisible();
    // Azerbaijani uses a decimal comma, even on Chromium's trimmed ICU data.
    await expect(page.getByText(/^Təxmini sığorta haqqı: \d+,\d{2} AZN$/)).toBeAttached();

    await chooseSegment(page, 'English');
    await expect(h1).toHaveText('Insurance, priced in the open.');
  });

  test('calculator reprices from the live API when inputs change', async ({ page }) => {
    await usePreferences(page, { lang: 'en' });
    await page.goto('/');
    const initial = await waitForPremium(page);

    const repriced = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/quotes/calculate') &&
        quoteBody(r.request()).engineCapacityCc === 3500,
    );
    const engine = page.getByLabel('Engine capacity');
    await engine.fill('3500');
    const response = await repriced;
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { engineFactor: number; premium: number };
    expect(body.engineFactor).toBe(1.6);

    await expect(premiumText(page)).not.toHaveText(initial);
    await expect(page.getByRole('cell', { name: '×1.60' })).toBeVisible();

    // Switching product changes the base rate (MTPL 50 → CASCO 250 AZN).
    await page.getByText('CASCO', { exact: true }).click();
    await expect(page.getByRole('cell', { name: '250.00 AZN' })).toBeVisible();
  });

  test('invalid input is flagged and not priced', async ({ page }) => {
    await usePreferences(page, { lang: 'en' });
    await page.goto('/');
    await waitForPremium(page);

    let sent = false;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/quotes/calculate') && quoteBody(r).vehicleYear === 2099) {
        sent = true;
      }
    });
    await page.getByLabel('Vehicle model year').fill('2099');
    await expect(page.getByText("Model year can't be in the future.")).toBeVisible();
    await page.waitForTimeout(800);
    expect(sent).toBe(false);
  });
});
