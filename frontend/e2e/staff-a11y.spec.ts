import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminApi,
  cabinetApi,
  claimsApi,
  clientWithClaim,
  expectNoHorizontalScroll,
  FILES,
  isoToday,
  openSession,
  registerSession,
  seedPreferences,
  staffApi,
  waitForAnimations,
} from './helpers';
import type { Theme } from './helpers';

// Every staff page in both themes: no serious or critical axe violations and
// nothing wider than the viewport (the mobile project runs this at 390px).
const THEMES: Theme[] = ['dark', 'light'];

async function expectAccessible(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await waitForAnimations(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
    }));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

async function check(page: Page, path: string, ready: (p: Page) => Promise<void>) {
  await page.goto(path);
  await ready(page);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
}

for (const theme of THEMES) {
  test(`adjuster pages pass axe and fit the viewport (${theme})`, async ({ page }) => {
    const admin = await adminApi(page);
    const adjuster = await admin.createStaff('Adjuster');
    const { claim, session: client } = await clientWithClaim(page);
    await claimsApi(page, client).upload(claim.id, 'front.png', FILES.png);
    expect(
      (await staffApi(page, adjuster.session).post(`/api/claims/${claim.id}/review`)).status(),
    ).toBe(200);
    await seedPreferences(page, { theme, lang: 'en' });
    await openSession(page, adjuster.session);

    await check(page, '/app', (p) =>
      expect(p.getByRole('heading', { name: 'Claims desk' })).toBeVisible(),
    );
    await check(page, '/app/claims?view=mine', (p) =>
      expect(p.getByText(/^\d+ claims?$/)).toBeVisible(),
    );
    await check(page, '/app/claims/' + claim.id, (p) =>
      expect(p.getByRole('heading', { name: 'Decision' })).toBeVisible(),
    );

    await test.step('decision form with an error summary', async () => {
      await page.getByRole('radio', { name: 'Reject' }).check();
      await page.getByRole('button', { name: 'Reject the claim' }).click();
      await expect(page.getByTestId('error-summary')).toBeVisible();
      await expectAccessible(page);
    });

    await test.step('document preview open', async () => {
      await page.getByRole('button', { name: /^View/ }).click();
      await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    });

    await check(page, '/app/help', (p) =>
      expect(p.getByRole('heading', { name: 'What the claim statuses mean' })).toBeVisible(),
    );
  });

  test(`agent pages pass axe and fit the viewport (${theme})`, async ({ page }) => {
    const admin = await adminApi(page);
    const agent = await admin.createStaff('Agent');
    const { user, session: client } = await registerSession(page);
    const customerId = await admin.customerIdFor(user.email);
    await admin.assignAgent(customerId, agent.id);
    // A vehicle and an agent-sold, paid policy: every list has a row.
    await cabinetApi(page, client).vehicle();
    const vehicles = (await (
      await staffApi(page, agent.session).get(`/api/vehicles?customerId=${customerId}`)
    ).json()) as { id: string }[];
    const sale = await staffApi(page, agent.session).post('/api/policies', {
      vehicleId: vehicles[0]?.id,
      policyTypeCode: 'MTPL',
      startDate: isoToday(1),
      termMonths: 12,
      customerId,
    });
    expect(sale.status(), await sale.text()).toBe(201);
    const { id: policyId } = (await sale.json()) as { id: string };
    expect(
      (await staffApi(page, agent.session).post(`/api/policies/${policyId}/pay`)).status(),
    ).toBe(200);

    await seedPreferences(page, { theme, lang: 'en' });
    await openSession(page, agent.session);

    await check(page, '/app', (p) => expect(p.getByText('Premium written')).toBeVisible());
    await check(page, '/app/customers', (p) =>
      expect(p.getByText('1 customer', { exact: true })).toBeVisible(),
    );
    await check(page, `/app/customers/${customerId}`, (p) =>
      expect(p.getByRole('heading', { name: 'Policies', exact: true })).toBeVisible(),
    );
    await check(page, `/app/customers/${customerId}/sell`, (p) =>
      expect(p.getByRole('radio', { name: /CASCO/ })).toBeVisible(),
    );
    await check(page, '/app/sales', (p) =>
      expect(p.getByText('1 policy', { exact: true })).toBeVisible(),
    );
    await check(page, '/app/help', (p) =>
      expect(p.getByRole('heading', { name: 'Customers and sales' })).toBeVisible(),
    );
  });

  test(`admin pages pass axe and fit the viewport (${theme})`, async ({ page }) => {
    const admin = await (await adminApi(page)).createStaff('Admin');
    const { user } = await registerSession(page);
    const customerId = await (await adminApi(page)).customerIdFor(user.email);
    await seedPreferences(page, { theme, lang: 'en' });
    await openSession(page, admin.session);

    await check(page, '/app?range=24m', (p) =>
      expect(p.getByRole('heading', { name: 'Top agents by premium' })).toBeVisible(),
    );
    await test.step('a chart with its table open', async () => {
      await page.getByText('Show the numbers as a table').first().click();
      await expectAccessible(page);
    });
    await check(page, '/app/admin/staff', (p) =>
      expect(p.getByText(/^\d+ accounts?$/)).toBeVisible(),
    );
    await test.step('create dialog with an error summary', async () => {
      await page.getByRole('button', { name: 'Add a staff member' }).click();
      await page.getByRole('button', { name: 'Create the account' }).click();
      await expect(page.getByRole('dialog').getByTestId('error-summary')).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await page.keyboard.press('Escape');
    });
    await check(page, '/app/customers', (p) =>
      expect(p.getByText(/^\d+ customers?$/)).toBeVisible(),
    );
    await check(page, `/app/customers/${customerId}`, (p) =>
      expect(p.getByRole('region', { name: 'Agent' })).toBeVisible(),
    );
    await check(page, '/app/admin/policies', (p) =>
      expect(p.getByText(/^\d+ polic(y|ies)$/)).toBeVisible(),
    );
    await check(page, '/app/claims?view=all', (p) =>
      expect(p.getByText(/^\d+ claims?$/)).toBeVisible(),
    );
    await check(page, '/app/admin/audit', (p) =>
      expect(p.getByText(/^\d+ events?$/)).toBeVisible(),
    );
    await test.step('a calendar open in a date filter', async () => {
      await page.getByRole('button', { name: 'Open calendar' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Choose a date' })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await page.keyboard.press('Escape');
    });
    await check(page, '/app/admin/policy-types', (p) =>
      expect(p.getByText(/rates are illustrative/)).toBeVisible(),
    );
    await check(page, '/app/help', (p) =>
      expect(p.getByRole('heading', { name: 'The admin panel' })).toBeVisible(),
    );
  });
}
