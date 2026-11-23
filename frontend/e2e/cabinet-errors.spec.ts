import { expect, test } from '@playwright/test';
import {
  expectNoAxeViolations,
  openSession,
  randomUser,
  registerSession,
  seedPreferences,
} from './helpers';

// Error states inside the signed-in area: offline, API unreachable or in
// maintenance, a session that ended, a forbidden section and a crash.
test.describe('Cabinet error states', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
  });

  test('offline: a banner, then the offline page, and Reload recovers', async ({
    page,
    context,
  }) => {
    const { session, user } = await registerSession(page);
    await openSession(page, session);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByText('You’re offline. Open pages keep working')).toBeVisible();
    // Help's code hasn't been loaded yet, so opening it needs the network.
    const menu = page.getByRole('button', { name: `${user.fullName}, account menu` });
    await menu.click();
    const panel = page.locator(`[id="${(await menu.getAttribute('aria-controls')) ?? ''}"]`);
    await panel.getByRole('link', { name: 'Help and questions' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re offline.');
    await expectNoAxeViolations(page);

    await context.setOffline(false);
    await expect(page.getByText('You’re offline. Open pages keep working')).toBeHidden();
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Help/);
  });

  test('the API unreachable, then back: Try again recovers', async ({ page }) => {
    const { session } = await registerSession(page);
    await openSession(page, session);
    await page.route('**/api/auth/me', (route) => route.abort('connectionrefused'));
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'PolisGo can’t be reached right now.',
    );
    await page.unroute('**/api/auth/me');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Hello, /);
  });

  test('maintenance (503) shows its page with the reference', async ({ page }) => {
    const { session } = await registerSession(page);
    await openSession(page, session);
    const traceId = '00-0a1b2c3d4e5f60718293a4b5c6d7e8f9-0123456789abcdef-00';
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Service Unavailable', status: 503, traceId }),
      }),
    );
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Back shortly.');
    await expect(page.getByTestId('reference-chip')).toContainText('Reference 0A1B2C3D');
    await expectNoAxeViolations(page);
  });

  test('a session the API no longer accepts shows the session-ended page', async ({ page }) => {
    const user = randomUser();
    const { session } = await registerSession(page, user);
    await openSession(page, { ...session, token: `${session.token}x` });
    await page.goto('/app/policies');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your session has ended.');
    await expectNoAxeViolations(page);

    // Keyboard only: sign in again and land back where we were.
    await page.getByRole('link', { name: 'Sign in again' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/policies$/);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`the 403 page passes axe and leads back by keyboard (${theme})`, async ({ page }) => {
      await seedPreferences(page, { theme }, { override: true });
      const { session } = await registerSession(page);
      await openSession(page, session);
      await page.goto('/app/admin/staff');
      await expect(
        page.getByRole('heading', { level: 1, name: "This area isn't available for your role" }),
      ).toBeVisible();
      await expect(page.getByText('Your account (Client) doesn')).toBeVisible();
      await expectNoAxeViolations(page);
      await page.getByRole('link', { name: 'Back to workspace' }).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/app$/);
    });
  }

  test('a crash inside the cabinet keeps the sidebar and the header', async ({ page }) => {
    const { session } = await registerSession(page);
    await openSession(page, session);
    await page.goto('/app/__e2e/crash');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Something broke on our side.',
    );
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(
      page
        .getByRole('button', { name: 'Back to workspace' })
        .or(page.getByRole('link', { name: 'Back to workspace' })),
    ).toBeVisible();
  });
});
