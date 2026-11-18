import { expect, test } from '@playwright/test';
import {
  API_URL,
  cabinetApi,
  randomUser,
  registerSession,
  seedPreferences,
  openSession,
} from './helpers';

test.describe('Cabinet account', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
  });

  test('sign in through the form lands on the overview', async ({ page }) => {
    const { user, session } = await registerSession(page);
    await cabinetApi(page, session).activePolicy();

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Leyla');
    await expect(page.getByText('Active policies', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  });

  test('edit name and phone, with client and server validation', async ({ page }) => {
    const { user, session } = await registerSession(page);
    await openSession(page, session);
    await page.goto('/app/profile');

    const name = page.getByLabel('Full name');
    const phone = page.getByLabel('Phone');
    await expect(phone).toHaveValue('+994 50 123 45 67');

    await name.fill('x1');
    await phone.fill('12');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('error-summary')).toContainText('Use 2–100 letters');
    await expect(name).toBeFocused();

    // Server side: tamper with the request to prove the API rule and the mapping.
    await name.fill('Nigar Əliyeva');
    await phone.fill('055 987 65 43');
    await expect(phone).toHaveValue('+994 55 987 65 43');
    await page.route(`${API_URL}/api/me`, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      await route.continue({
        postData: JSON.stringify({ fullName: 'Nigar Əliyeva', phone: '123' }),
      });
    });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('Enter an Azerbaijani number: +994 and 9 digits.', { exact: true }),
    ).toBeVisible();
    await page.unroute(`${API_URL}/api/me`);

    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me') && r.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save changes' }).click();
    const body = (await (await saved).json()) as { fullName: string; phone: string };
    expect(body).toMatchObject({ fullName: 'Nigar Əliyeva', phone: '+994559876543' });
    await expect(page.getByText('Your details were saved.')).toBeVisible();
    // The header reads the new name.
    await expect(page.getByRole('button', { name: 'Nigar Əliyeva, account menu' })).toBeVisible();
    expect(user.email).toContain('@polisgo.test');
  });

  test('a wrong current password is a field error in the user’s language, not a sign-out', async ({
    page,
  }) => {
    const { session } = await registerSession(page);
    await seedPreferences(page, { lang: 'ru' }, { override: true });
    await openSession(page, session);
    await page.goto('/app/profile');

    await page.getByLabel('Текущий пароль').fill('Wrong-password-1');
    await page.getByLabel('Новый пароль').fill('Better456x');
    await page.getByLabel('Повторите пароль').fill('Better456x');
    const response = page.waitForResponse((r) => r.url().endsWith('/api/me/change-password'));
    await page.getByRole('button', { name: 'Сменить пароль' }).click();
    expect((await response).status()).toBe(400);

    const current = page.getByLabel('Текущий пароль');
    await expect(current).toHaveAttribute('aria-invalid', 'true');
    await expect(current).toBeFocused();
    await expect(page.getByText('Это не ваш текущий пароль.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/profile$/);
  });

  test('change the password, then sign in with the new one', async ({ page }) => {
    const { user, session } = await registerSession(page);
    await openSession(page, session);
    await page.goto('/app/profile');

    await page.getByLabel('Current password').fill(user.password);
    await page.getByLabel('New password').fill(user.password);
    await page.getByLabel('Repeat password').fill(user.password);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByTestId('error-summary')).toContainText(
      'Choose a password different from the current one.',
    );

    const next = `${user.password}Z9`;
    await page.getByLabel('New password').fill(next);
    await page.getByLabel('Repeat password').fill(next);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Your password was changed.')).toBeVisible();
    await expect(page.getByLabel('Current password')).toHaveValue('');

    const login = (password: string) =>
      page.request.post(`${API_URL}/api/auth/login`, { data: { email: user.email, password } });
    expect((await login(user.password)).status()).toBe(401);
    expect((await login(next)).status()).toBe(200);
  });

  test('notifications: unread badge, mark as read, read all', async ({ page }) => {
    const { session } = await registerSession(page);
    const api = cabinetApi(page, session);
    const first = await api.activePolicy(1, 'MTPL');
    await api.activePolicy(1, 'CASCO');
    await openSession(page, session);
    await page.goto('/app');

    const bell = page.getByRole('button', { name: 'Notifications, 2 unread' });
    await bell.click();
    await expect(bell).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByRole('region', { name: 'Updates', exact: true });
    await expect(panel.getByRole('listitem')).toHaveCount(2);

    await panel
      .getByRole('button', { name: `Mark as read — ${first.policy.policyNumber}` })
      .click();
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();

    await panel.getByRole('button', { name: 'Mark all as read' }).click();
    const quiet = page.getByRole('button', { name: 'Notifications, none unread' });
    await expect(quiet).toBeVisible();

    // Escape closes the panel and returns focus to the bell.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(quiet).toBeFocused();
  });

  test('a client cannot open staff areas or another client’s policy', async ({ page }) => {
    const other = await registerSession(page, randomUser());
    const { policy } = await cabinetApi(page, other.session).activePolicy();
    const { session } = await registerSession(page);
    await openSession(page, session);

    // /app/claims is the client's own claims page; the staff desks are not.
    for (const path of ['/app/admin', '/app/agent']) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: "This area isn't available for your role" }),
      ).toBeVisible();
    }

    // The staff sections are not offered either.
    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);

    // IDOR: the other client's policy id answers exactly like a missing one.
    const response = page.waitForResponse((r) => r.url().endsWith(`/api/policies/${policy.id}`));
    await page.goto(`/app/policies/${policy.id}`);
    expect((await response).status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Policy not found' })).toBeVisible();
    await expect(page.getByText(policy.policyNumber)).toHaveCount(0);
  });
});
