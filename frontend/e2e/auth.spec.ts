import { expect, test } from '@playwright/test';
import { chooseSetting, randomUser, registerViaApi, seedPreferences } from './helpers';

test.describe('Auth', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en' });
  });

  test('protected routes redirect anonymous visitors to sign-in', async ({ page }) => {
    await page.goto('/app/admin');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back.');
  });

  test('register a new user, sign out, sign back in', async ({ page }) => {
    const user = randomUser();

    await test.step('register', async () => {
      await page.goto('/register');
      await page.getByLabel('Full name').fill(user.fullName);
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Phone').fill(user.phone);
      await page.getByLabel('Date of birth').fill(user.birthDate);
      await page.getByLabel('Driving licence issued on').fill(user.drivingLicenseDate);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByLabel('Repeat password').fill(user.password);

      const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
      await page.getByRole('button', { name: 'Create account' }).click();
      expect((await response).status()).toBe(200);

      await expect(page).toHaveURL(/\/app$/);
      // A new client: greeted by first name, with a real empty state.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Leyla');
      await expect(page.getByRole('heading', { name: 'No policies yet' })).toBeVisible();
    });

    await test.step('session survives a reload', async () => {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Leyla');
    });

    await test.step('role guard blocks a Client from the admin area', async () => {
      await page.goto('/app/admin');
      await expect(
        page.getByRole('heading', { name: "This area isn't available for your role" }),
      ).toBeVisible();
    });

    await test.step('sign out', async () => {
      await page.getByRole('button', { name: `${user.fullName}, account menu` }).click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText('You have been signed out.')).toBeVisible();
      await page.goto('/app');
      await expect(page).toHaveURL(/\/login$/);
    });

    await test.step('sign back in', async () => {
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Leyla');
    });
  });

  test('a wrong password shows a translated error with the trace id', async ({ page }) => {
    const user = randomUser();
    await registerViaApi(page, user);

    await page.goto('/login');
    await chooseSetting(page, 'Русский');
    await page.getByLabel('Эл. почта').fill(user.email);
    await page.getByLabel('Пароль', { exact: true }).fill('Wrong-password-1');

    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Войти' }).click();
    const login = await response;
    expect(login.status()).toBe(401);
    const { traceId } = (await login.json()) as { traceId: string };

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Неверная эл. почта или пароль.');
    await expect(alert).toContainText(`Код обращения: ${traceId}`);
    await expect(page).toHaveURL(/\/login$/);
  });
});
