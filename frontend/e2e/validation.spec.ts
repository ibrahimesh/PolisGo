import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { API_URL, randomUser, seedPreferences } from './helpers';

// Negative paths: invalid input must be stopped with a translated, field-level
// message and must never reach the API.

function trackAuthRequests(page: Page) {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/auth/')) sent.push(new URL(r.url()).pathname);
  });
  return sent;
}

async function fillRegister(
  page: Page,
  values: Partial<
    Record<'name' | 'email' | 'phone' | 'birth' | 'licence' | 'password' | 'confirm', string>
  >,
) {
  const v = {
    name: 'Leyla Məmmədova',
    email: 'leyla@mail.az',
    phone: '501234567',
    birth: '1990-05-01',
    licence: '2010-06-01',
    password: 'Secret123',
    confirm: 'Secret123',
    ...values,
  };
  await page.getByLabel('Full name').fill(v.name);
  await page.getByLabel('Email').fill(v.email);
  await page.getByLabel('Phone').fill(v.phone);
  await page.getByLabel('Date of birth').fill(v.birth);
  await page.getByLabel('Driving licence issued on').fill(v.licence);
  await page.getByLabel('Password', { exact: true }).fill(v.password);
  await page.getByLabel('Repeat password').fill(v.confirm);
}

test.describe('Register validation', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en' });
    await page.goto('/register');
  });

  test('empty submit lists every field and focuses the first', async ({ page }) => {
    const sent = trackAuthRequests(page);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByTestId('error-summary')).toContainText('7 fields need attention');
    await expect(page.getByLabel('Full name')).toBeFocused();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toEqual([]);
  });

  const cases: [string, Parameters<typeof fillRegister>[1], string, string][] = [
    [
      'invalid email',
      { email: 'leyla@mail' },
      'Email',
      'Enter a valid email, like name@example.com.',
    ],
    [
      'invalid phone',
      { phone: '12345' },
      'Phone',
      'Enter an Azerbaijani number: +994 and 9 digits.',
    ],
    [
      'short password',
      { password: 'Ab1', confirm: 'Ab1' },
      'Password',
      'Use 8–64 characters with an uppercase letter, a lowercase letter and a number.',
    ],
    [
      'password without uppercase',
      { password: 'secret123', confirm: 'secret123' },
      'Password',
      'Use 8–64 characters',
    ],
    [
      'mismatched confirmation',
      { confirm: 'Secret124' },
      'Repeat password',
      'Passwords don’t match.',
    ],
    [
      'under 18',
      { birth: '2012-01-01', licence: '2026-01-01' },
      'Date of birth',
      'You must be at least 18 to open an account.',
    ],
  ];

  for (const [name, values, field, message] of cases) {
    test(`rejects ${name} without calling the API`, async ({ page }) => {
      const sent = trackAuthRequests(page);
      await fillRegister(page, values);
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page.getByTestId('error-summary')).toContainText(message);
      const input = page.getByLabel(field, { exact: true });
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toBeFocused();
      expect(sent).toEqual([]);
    });
  }

  test('masks a pasted phone and sends E.164', async ({ page }) => {
    const user = randomUser();
    await fillRegister(page, { name: user.fullName, email: user.email, phone: '050-123-45-67' });
    await expect(page.getByLabel('Phone')).toHaveValue('+994 50 123 45 67');

    const request = page.waitForRequest((r) => r.url().endsWith('/api/auth/register'));
    await page.getByRole('button', { name: 'Create account' }).click();
    const body = (await request).postDataJSON() as Record<string, unknown>;
    expect(body.phone).toBe('+994501234567');
    expect(body).not.toHaveProperty('confirmPassword');
    await expect(page).toHaveURL(/\/app$/);
  });

  // The client blocks these values, so tamper with the outgoing request to
  // prove the real API rejects them and the UI maps its 400 onto the fields.
  test('maps a server-side 400 onto the matching fields, translated', async ({ page }) => {
    const user = randomUser();
    await page.route(`${API_URL}/api/auth/register`, async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.continue({
        postData: JSON.stringify({ ...body, phone: '1', birthDate: '2015-01-01' }),
      });
    });
    await fillRegister(page, { name: user.fullName, email: user.email });

    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
    await page.getByRole('button', { name: 'Create account' }).click();
    const problem = await response;
    expect(problem.status()).toBe(400);
    expect(problem.headers()['content-type']).toContain('application/problem+json');

    const summary = page.getByTestId('error-summary');
    await expect(summary).toContainText('2 fields need attention');
    await expect(summary).toContainText('Phone: Enter an Azerbaijani number: +994 and 9 digits.');
    await expect(summary).toContainText(
      'Date of birth: You must be at least 18 to open an account.',
    );
    await expect(page.getByLabel('Phone')).toBeFocused();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('shows the live password checklist and strength', async ({ page }) => {
    const password = page.getByLabel('Password', { exact: true });
    const rules = page.getByRole('list', { name: 'Password requirements' });
    await password.fill('secret');
    await expect(rules).toContainText('An uppercase letter(missing)');
    await password.fill('Secret-123456');
    await expect(rules).toContainText('An uppercase letter(done)');
    await expect(page.getByText('Strong', { exact: true })).toBeVisible();
  });

  test('errors are translated (Azerbaijani)', async ({ page }) => {
    await page.getByRole('radio', { name: 'Azərbaycanca' }).locator('xpath=..').click();
    await page.getByRole('button', { name: 'Hesab yarat' }).click();
    await expect(page.getByTestId('error-summary')).toContainText('7 sahə düzəldilməlidir');
    await expect(page.getByTestId('error-summary')).toContainText(
      'Adınızı və soyadınızı daxil edin.',
    );
  });
});

test.describe('Sign-in validation and session handling', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en' });
  });

  test('rejects a malformed email and an empty password without calling the API', async ({
    page,
  }) => {
    await page.goto('/login');
    const sent = trackAuthRequests(page);
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByTestId('error-summary')).toContainText('2 fields need attention');
    await expect(page.getByLabel('Email')).toBeFocused();
    expect(sent).toEqual([]);
  });

  // Regression for "invalid input still ended up logged in": a session left in
  // the tab used to render the form, then silently redirect into that account.
  test('a stored session is announced, never silently resumed', async ({ page }) => {
    const user = randomUser();
    const response = await page.request.post(`${API_URL}/api/auth/register`, { data: user });
    const { token, expiresAt } = (await response.json()) as { token: string; expiresAt: string };

    await page.goto('/');
    await page.evaluate(
      ([t, e]) =>
        sessionStorage.setItem('polisgo.session', JSON.stringify({ token: t, expiresAt: e })),
      [token, expiresAt],
    );
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'You’re already signed in' })).toBeVisible();
    await expect(page.getByText(user.email, { exact: false })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByLabel('Email')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('polisgo.session'))).toBeNull();
  });
});
