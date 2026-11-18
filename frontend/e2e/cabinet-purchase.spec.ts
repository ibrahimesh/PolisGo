import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  cabinetApi,
  expectNoHorizontalScroll,
  isoToday,
  registerSession,
  uniqueVehicle,
  seedPreferences,
  openSession,
} from './helpers';

// The purchase wizard end to end, against the real API: client validation,
// server validation mapped into the UI, a reload mid-flow, payment through
// the fake gateway, and the PDF certificate.

const yourPremium = (page: Page) => page.getByText(/^Your premium: [\d.,\s]+ AZN$/);

test.describe('Purchase wizard', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
  });

  test('buy a policy end to end and download its certificate', async ({ page }) => {
    const { session } = await registerSession(page);
    await openSession(page, session);
    const vehicle = uniqueVehicle();

    await test.step('cover: client validation, then a valid choice', async () => {
      await page.goto('/app/buy');
      await expect(
        page.getByRole('heading', { name: 'What would you like to insure?' }),
      ).toBeVisible();
      await expect(page.getByText('Choose a vehicle to see your exact price.')).toBeVisible();

      await page.getByLabel('Cover starts on').fill(isoToday(-1));
      await page.getByRole('button', { name: 'Continue' }).click();
      const summary = page.getByTestId('error-summary');
      await expect(summary).toContainText('Choose a type of cover.');
      await expect(summary).toContainText('The start date can’t be in the past.');
      // Focus goes to the first invalid field: the first product radio.
      await expect(page.getByRole('radio', { name: /^MTPL/ })).toBeFocused();

      await page.getByRole('radio', { name: /^MTPL/ }).check();
      await page.getByLabel('Cover starts on').fill(isoToday());
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Which vehicle?' })).toBeFocused();
      await expectNoHorizontalScroll(page);
    });

    await test.step('vehicle: required, invalid input rejected, then added', async () => {
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByTestId('error-summary')).toContainText('Choose a vehicle.');

      await page.getByRole('button', { name: 'Add a vehicle' }).click();
      const form = page.getByRole('form', { name: 'New vehicle' });
      await form.getByLabel('Make').fill(vehicle.make);
      await form.getByLabel('Model', { exact: true }).fill(vehicle.model);
      await form.getByLabel('Model year').fill(String(vehicle.year));
      await form.getByLabel('Engine capacity').fill(String(vehicle.engineCapacityCc));
      await form.getByLabel('Plate number').fill('10--AA');
      await form.getByLabel('VIN').fill('IOQ123');
      await form.getByRole('button', { name: 'Save vehicle' }).click();
      await expect(form.getByTestId('error-summary')).toContainText('A VIN has 17 characters');
      await expect(form.getByLabel('Plate number')).toHaveAttribute('aria-invalid', 'true');

      await form.getByLabel('Plate number').fill(vehicle.plateNumber);
      await form.getByLabel('VIN').fill(vehicle.vin);
      await form.getByRole('button', { name: 'Save vehicle' }).click();
      await expect(
        page.getByRole('radio', { name: new RegExp(vehicle.plateNumber) }),
      ).toBeChecked();
      await expect(yourPremium(page)).toBeAttached({ timeout: 15_000 });

      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Check the details' })).toBeVisible();
    });

    let policyNumber = '';
    await test.step('review: the acceptance is required, then a draft is created', async () => {
      const confirm = page.getByRole('button', { name: 'Confirm and continue to payment' });
      await confirm.click();
      await expect(page.getByTestId('error-summary')).toContainText(
        'Confirm the details to continue.',
      );
      await expect(page.getByRole('checkbox')).toBeFocused();

      await page.getByRole('checkbox').check();
      const created = page.waitForResponse(
        (r) => r.url().endsWith('/api/policies') && r.request().method() === 'POST',
      );
      await confirm.click();
      const body = (await (await created).json()) as { policyNumber: string; status: string };
      expect(body.status).toBe('Draft');
      policyNumber = body.policyNumber;
      await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
    });

    await test.step('a reload keeps the step and the draft', async () => {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
      await expect(page.getByText(policyNumber)).toBeVisible();
    });

    await test.step('pay once, even on a double click', async () => {
      const payments: string[] = [];
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().endsWith('/pay')) payments.push(r.url());
      });
      await page.getByRole('button', { name: /^Pay / }).dblclick();
      await expect(page.getByRole('heading', { name: 'You’re covered.' })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: policyNumber })).toContainText(
        'is active',
      );
      expect(payments).toHaveLength(1);
    });

    await test.step('download the certificate', async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download certificate (PDF)' }).click(),
      ]);
      expect(download.suggestedFilename()).toBe(`PolisGo-${policyNumber}.pdf`);
      const bytes = readFileSync(await download.path());
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(5_000);
    });

    await test.step('the policy page shows it active, with history', async () => {
      await page.getByRole('link', { name: 'View the policy' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'MTPL' })).toBeVisible();
      await expect(page.getByText('Active').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Status history' })).toBeVisible();
    });

    await test.step('the certificate also downloads in Azerbaijani', async () => {
      await page.evaluate(() => localStorage.setItem('polisgo.lang', 'az'));
      await page.reload();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Şəhadətnaməni yüklə (PDF)' }).click(),
      ]);
      const bytes = readFileSync(await download.path());
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  test('the server rejects overlapping cover, in the user’s language', async ({ page }) => {
    const { session } = await registerSession(page);
    const api = cabinetApi(page, session);
    await api.activePolicy(12, 'MTPL');
    await seedPreferences(page, { lang: 'ru' }, { override: true });
    await openSession(page, session);

    await page.goto('/app/buy');
    await page.getByRole('radio', { name: /^ОСАГО/ }).check();
    await expect(page.getByText('Такое сочетание нельзя рассчитать')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Продолжить' }).click();
    await expect(page.getByRole('alert').first()).toContainText(
      'У этого автомобиля уже есть черновик или действующий полис этого вида на эти даты.',
    );
    await expect(page.getByRole('heading', { name: 'Что вы хотите застраховать?' })).toBeVisible();
  });

  // The client blocks a past start date, so tamper with the request to prove
  // the API rejects it and the 400 lands on the right field, translated.
  test('maps a server-side 400 onto the start date field', async ({ page }) => {
    const { session } = await registerSession(page);
    await cabinetApi(page, session).vehicle();
    await openSession(page, session);
    await page.goto('/app/buy');
    await page.getByRole('radio', { name: /^CASCO/ }).check();
    await expect(yourPremium(page)).toBeAttached({ timeout: 15_000 });

    await page.route('**/api/policies/quote', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.continue({ postData: JSON.stringify({ ...body, startDate: isoToday(-3) }) });
    });
    await page.getByRole('button', { name: 'Continue' }).click();
    const date = page.getByLabel('Cover starts on');
    await expect(date).toHaveAttribute('aria-invalid', 'true');
    await expect(date).toBeFocused();
    await expect(
      page.getByText('The start date can’t be in the past.', { exact: true }),
    ).toBeVisible();
  });

  test('renew from a reminder pre-fills the next period', async ({ page }) => {
    const { session } = await registerSession(page);
    const { vehicle, policy } = await cabinetApi(page, session).activePolicy(1, 'MTPL');
    await openSession(page, session);

    await page.goto('/app');
    await expect(page.getByText('1 policy ends within 30 days.')).toBeVisible();
    await page.getByRole('link', { name: new RegExp(`^Renew — ${policy.policyNumber}`) }).click();

    await expect(page).toHaveURL(/\/app\/buy$/);
    await expect(page.getByRole('radio', { name: /^MTPL/ })).toBeChecked();
    const nextDay = new Date(`${policy.endDate}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    await expect(page.getByLabel('Cover starts on')).toHaveValue(
      nextDay.toISOString().slice(0, 10),
    );
    // The renewal does not overlap the current policy, so it prices.
    await expect(yourPremium(page)).toBeAttached({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('radio', { name: new RegExp(vehicle.plateNumber) })).toBeChecked();
  });

  test('an unpaid draft resumes at payment from its page', async ({ page }) => {
    const { session } = await registerSession(page);
    const api = cabinetApi(page, session);
    const vehicle = await api.vehicle();
    const draft = await api.policy(vehicle.id, 'CASCO', 6);
    await openSession(page, session);

    await page.goto(`/app/policies/${draft.id}`);
    await page.getByRole('link', { name: 'Pay now' }).click();
    await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
    await expect(page.getByText(draft.policyNumber)).toBeVisible();
    await page.getByRole('button', { name: /^Pay / }).click();
    await expect(page.getByRole('heading', { name: 'You’re covered.' })).toBeVisible();
  });
});
