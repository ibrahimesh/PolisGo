import { expect, test } from '@playwright/test';
import { cabinetApi, openSession, randomUser, registerSession } from './helpers';

// Audit reproduction: when a session ends without an explicit sign-out (the
// token's expiry timer, or a 401 from a revoked session), the next person to
// sign in on the same tab must not see the previous person's data.
test('a session that expires leaves no private data for the next user', async ({ page }) => {
  const a = await registerSession(page);
  const { policy } = await cabinetApi(page, a.session).activePolicy(1);
  const bUser = randomUser();
  await registerSession(page, bUser);

  await page.clock.install({ time: new Date() });
  await openSession(page, a.session);
  await page.goto('/app/policies');
  await expect(page.getByText(policy.policyNumber).filter({ visible: true }).first()).toBeVisible();

  // A walks away; the 60-minute token runs out in the open tab.
  await page.clock.fastForward('01:01:00');
  await page.waitForURL('**/login');
  await page.clock.setSystemTime(new Date());

  // B's list loads slowly, as on a real network.
  await page.route('**/api/policies?**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.getByLabel('Email').fill(bUser.email);
  await page.getByLabel('Password', { exact: true }).fill(bUser.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app/policies');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/audit-cache-leak.png' });

  const leaked = await page.getByText(policy.policyNumber).filter({ visible: true }).count();
  expect(leaked, `B sees A's policy ${policy.policyNumber} on /app/policies`).toBe(0);
});
