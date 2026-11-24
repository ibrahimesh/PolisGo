import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminApi,
  API_URL,
  displayDate,
  expectNoHorizontalScroll,
  isoToday,
  openSession,
  randomUser,
  registerSession,
  seedPreferences,
  staffApi,
} from './helpers';

// The admin panel against the real API: the dashboard on demo data, staff
// accounts (create, deactivate so sign-in fails, role change, your own row),
// agent assignment, the audit feed and the all-policies export. The mobile
// project reruns this at 390px.

async function signedInAdmin(page: Page) {
  const admin = await (await adminApi(page)).createStaff('Admin');
  await seedPreferences(page, { lang: 'en', theme: 'dark' });
  await openSession(page, admin.session);
  return admin;
}

const DEMO_AGENT = 'demo.agent1@demo.polisgo.az';

const visible = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).locator('visible=true');

test.describe('Admin panel', () => {
  test('the dashboard shows demo data over 24 months, with a table for each chart', async ({
    page,
  }) => {
    // The demo data (docker-compose.demo.yml) has this agent selling all year.
    const demoAgent = await (await adminApi(page)).staffId(DEMO_AGENT);
    await signedInAdmin(page);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    await page.getByText('24 months', { exact: true }).click();
    await expect(page).toHaveURL(/range=24m/);
    // The demo agents sell over the past year (docker-compose.demo.yml).
    const agents = page.getByRole('region', { name: 'Top agents by premium' });
    await expect(agents.locator(`a[href$="${demoAgent}"]`)).toHaveText('Leyla Əliyeva');

    const chart = page.getByRole('figure').filter({ hasText: 'Policies issued by month' });
    await chart.getByText('Show the numbers as a table').click();
    await expect(chart.getByRole('table')).toBeVisible();
    await expect(chart.getByRole('row')).toHaveCount(25); // header + 24 months

    // The chart itself reads out a month from the keyboard.
    await chart.getByRole('group', { name: 'Policies issued by month' }).focus();
    await page.keyboard.press('End');
    await expect(chart.locator('[aria-live="polite"]')).not.toHaveText('');
    await expectNoHorizontalScroll(page);
  });

  test('creates a staff member, then deactivating them refuses their sign-in', async ({ page }) => {
    await signedInAdmin(page);
    await page.goto('/app/admin/staff');
    await page.getByRole('button', { name: 'Add a staff member' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a staff member' });

    // The registration rules, with the error summary and focus.
    await dialog.getByRole('button', { name: 'Create the account' }).click();
    await expect(dialog.getByTestId('error-summary')).toContainText(
      'Choose Agent, Adjuster or Admin.',
    );
    await expect(dialog.getByLabel('Full name')).toBeFocused();

    const user = randomUser();
    await dialog.getByLabel('Full name').fill(user.fullName);
    await dialog.getByLabel('Email').fill(user.email);
    await dialog.getByLabel('First password', { exact: true }).fill(user.password);
    await dialog.getByRole('radio', { name: 'Adjuster' }).check();
    await dialog.getByRole('button', { name: 'Create the account' }).click();
    await expect(page.getByText(`${user.fullName} can now sign in`)).toBeVisible();

    const login = () =>
      page.request.post(`${API_URL}/api/auth/login`, {
        data: { email: user.email, password: user.password },
      });
    expect((await login()).status()).toBe(200);

    await page.getByRole('searchbox', { name: 'Search' }).fill(user.email);
    await expect(page.getByText('1 account', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: `Deactivate, ${user.fullName}` })
      .locator('visible=true')
      .click();
    const confirm = page.getByRole('dialog', { name: `Deactivate ${user.fullName}?` });
    await confirm.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByText(`${user.fullName} is deactivated`)).toBeVisible();
    await expect(visible(page, 'Deactivated').first()).toBeVisible();

    expect((await login()).status()).toBe(401);
    await expectNoHorizontalScroll(page);
  });

  test('a role change asks first and ends the old session', async ({ page }) => {
    const api = await adminApi(page);
    const agent = await api.createStaff('Agent');
    await signedInAdmin(page);
    await page.goto(`/app/admin/staff?q=${encodeURIComponent(agent.email)}`);

    await page
      .getByRole('button', { name: `Change role, ${agent.fullName}` })
      .locator('visible=true')
      .click();
    const confirm = page.getByRole('dialog', { name: `Change the role of ${agent.fullName}?` });
    await expect(confirm).toContainText('Their open sessions end');
    await confirm.getByRole('radio', { name: 'Adjuster' }).check();
    await confirm.getByRole('button', { name: 'Change role' }).click();
    await expect(page.getByText(`${agent.fullName} is now Adjuster`)).toBeVisible();

    // The agent's token from before no longer works.
    expect((await staffApi(page, agent.session).get('/api/auth/me')).status()).toBe(401);
  });

  test('your own account has no actions, and the server refuses them too', async ({ page }) => {
    const admin = await signedInAdmin(page);
    await page.goto(`/app/admin/staff?q=${encodeURIComponent(admin.email)}`);
    await expect(visible(page, 'Your account')).toBeVisible();
    await expect(page.getByRole('button', { name: `Deactivate, ${admin.fullName}` })).toHaveCount(
      0,
    );

    // A tampered request gets the same answer, in the user's language via the API message.
    const self = await staffApi(page, admin.session).post(`/api/users/${admin.id}/deactivate`);
    expect(self.status()).toBe(409);
    const problem = (await self.json()) as { detail: string; traceId: string };
    expect(problem.detail).toBe("You can't deactivate your own account or change your own role.");
    expect(problem.traceId).toBeTruthy();
  });

  test('assigns a customer to an agent, who then sees them; the audit log records it', async ({
    page,
  }) => {
    const api = await adminApi(page);
    const agent = await api.createStaff('Agent');
    const { user } = await registerSession(page);
    const customerId = await api.customerIdFor(user.email);
    const admin = await signedInAdmin(page);

    await page.goto(`/app/customers/${customerId}`);
    const assign = page.getByRole('region', { name: 'Agent' });
    // A large team: search, then pick (selectOption waits for the option).
    await assign.getByRole('searchbox', { name: 'Search for: Agent' }).fill(agent.email);
    await assign.getByRole('combobox', { name: 'Agent' }).selectOption(agent.id);
    await assign.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`${user.fullName} is now with ${agent.fullName}`)).toBeVisible();

    const book = await staffApi(page, agent.session).get(`/api/customers/${customerId}`);
    expect(book.status()).toBe(200);

    // The audit feed, filtered to this admin's customer events today.
    await page.goto('/app/admin/audit');
    // Actor: type to narrow the staff list, then pick the person.
    const actor = page.getByRole('combobox', { name: 'Actor' });
    await actor.fill(admin.email);
    await page
      .getByRole('listbox', { name: 'Actor' })
      .getByRole('option', { name: new RegExp(admin.email.replace(/[.+]/g, '\\$&')) })
      .click();
    await expect(page).toHaveURL(new RegExp(`actor=${admin.id}`));
    await page.getByLabel('What').selectOption({ label: 'Customer' });
    await page.getByRole('textbox', { name: 'From' }).fill(displayDate(isoToday()));
    await expect(page).toHaveURL(new RegExp(`from=${isoToday()}`));
    await expect(page.getByText('1 event', { exact: true })).toBeVisible();
    await expect(page.getByText(`assigned to ${agent.fullName}`)).toBeVisible();

    // A date that isn't one is explained, and doesn't filter.
    await page.getByRole('textbox', { name: 'To' }).fill('31.02');
    await page.getByRole('textbox', { name: 'To' }).blur();
    await expect(page.getByText('Enter a valid date.').locator('visible=true')).toBeVisible();
    await expect(page).not.toHaveURL(/to=/);
  });

  test('exports all policies with the agent filter as UTF-8 CSV', async ({ page }) => {
    const demoAgent = await (await adminApi(page)).staffId(DEMO_AGENT);
    await signedInAdmin(page);
    await page.goto('/app/admin/policies');
    await expect(page.getByRole('heading', { level: 1, name: 'All policies' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search for: Sold by' }).fill(DEMO_AGENT);
    await page.getByRole('combobox', { name: 'Sold by' }).selectOption(demoAgent);
    await expect(page).toHaveURL(/agent=/);
    await expect(page.getByText(/^\d+ polic(y|ies)$/)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    const bytes = readFileSync(await download.path());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes.subarray(3).toString('utf8').split('\r\n').filter(Boolean);
    expect(lines[0]).toMatch(/,Agent$/);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines.slice(1)) expect(line).toMatch(/,Leyla Əliyeva$/);
  });

  test('the products page is read-only and says the rates are illustrative', async ({ page }) => {
    await signedInAdmin(page);
    await page.goto('/app/admin/policy-types');
    await expect(page.getByText(/rates are illustrative/)).toBeVisible();
    await expect(page.getByText(/MTPL/).locator('visible=true').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /edit|save/i })).toHaveCount(0);
  });

  test('staff management works from the keyboard alone', async ({ page }) => {
    await signedInAdmin(page);
    await page.goto('/app/admin/staff');
    const add = page.getByRole('button', { name: 'Add a staff member' });
    await add.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add a staff member' });
    await expect(dialog).toBeVisible();

    const user = randomUser();
    await dialog.getByLabel('Full name').focus();
    await page.keyboard.type(user.fullName);
    await page.keyboard.press('Tab');
    await page.keyboard.type(user.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(user.password);
    // Past the show-password toggle to the role radios; arrows choose.
    const agent = dialog.getByRole('radio', { name: 'Agent' });
    for (let i = 0; i < 6 && !(await agent.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Space');
    await expect(agent).toBeChecked();
    await dialog.getByRole('button', { name: 'Create the account' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(`${user.fullName} can now sign in`)).toBeVisible();
    await expect(dialog).toBeHidden();
  });
});

test.describe('Admin pages other roles may not open', () => {
  for (const role of ['Agent', 'Adjuster', 'Client'] as const) {
    test(`${role}: the admin panel shows the 403 page`, async ({ page }) => {
      const session =
        role === 'Client'
          ? (await registerSession(page)).session
          : (await (await adminApi(page)).createStaff(role)).session;
      await seedPreferences(page, { lang: 'en' });
      await openSession(page, session);
      for (const path of [
        '/app/admin/staff',
        '/app/admin/audit',
        '/app/admin/policies',
        '/app/admin/policy-types',
      ]) {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { name: "This area isn't available for your role" }),
          path,
        ).toBeVisible();
      }
    });
  }
});
