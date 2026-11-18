import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminApi,
  expectNoHorizontalScroll,
  openSession,
  registerSession,
  seedPreferences,
} from './helpers';

// The agent's desk: only their own customers, and selling a policy on a
// customer's behalf through to payment, the sales list and its export.

async function bookOf(page: Page, count: number) {
  const admin = await adminApi(page);
  const agent = await admin.createStaff('Agent');
  const customers = [];
  for (let i = 0; i < count; i++) {
    const { user } = await registerSession(page);
    const id = await admin.customerIdFor(user.email);
    await admin.assignAgent(id, agent.id);
    customers.push({ id, user });
  }
  return { admin, agent, customers };
}

test.describe('Agent desk', () => {
  test('sees only their own customers, never another agent’s', async ({ page }) => {
    const mine = await bookOf(page, 1);
    const theirs = await bookOf(page, 1);
    const myCustomer = mine.customers[0];
    const theirCustomer = theirs.customers[0];
    if (!myCustomer || !theirCustomer) throw new Error('setup');

    await seedPreferences(page, { lang: 'en', theme: 'dark' });
    await openSession(page, mine.agent.session);
    await page.goto('/app/customers');
    await expect(page.getByText('1 customer', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: myCustomer.user.fullName }).locator('visible=true'),
    ).toBeVisible();

    // Searching for the other agent's customer by email finds nothing.
    await page.getByRole('searchbox', { name: 'Search' }).fill(theirCustomer.user.email);
    await expect(page.getByRole('heading', { name: 'No customers match' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // And their page answers like an unknown one.
    await page.goto(`/app/customers/${theirCustomer.id}`);
    await expect(
      page.getByRole('heading', { name: 'This customer isn’t in your list' }),
    ).toBeVisible();
    await page.goto(`/app/customers/${theirCustomer.id}/sell`);
    await expect(
      page.getByRole('heading', { name: 'This customer isn’t in your list' }),
    ).toBeVisible();
  });

  test('sells a policy to their customer, takes payment, sees it in sales and the export', async ({
    page,
  }) => {
    const { agent, customers } = await bookOf(page, 1);
    const customer = customers[0];
    if (!customer) throw new Error('setup');
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
    await openSession(page, agent.session);

    await page.goto(`/app/customers/${customer.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: customer.user.fullName }),
    ).toBeVisible();
    // The details card names the agent who looks after the customer.
    await expect(
      page.getByRole('region', { name: 'Details' }).getByText(agent.fullName, { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Sell a policy' }).click();

    // No vehicle yet: register one for the customer from here.
    await expect(page.getByText('No vehicles on file yet.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Add a vehicle' }).click();
    const plate = `77-AG-${String(Math.floor(10000 + Math.random() * 89999))}`;
    await page.getByLabel('Make', { exact: true }).fill('Kia');
    await page.getByLabel('Model', { exact: true }).fill('Rio');
    await page.getByLabel('Model year', { exact: true }).fill('2021');
    await page.getByLabel('Engine capacity', { exact: true }).fill('1400');
    await page.getByLabel('Plate number', { exact: true }).fill(plate);
    await page.getByLabel('VIN', { exact: true }).fill('KNADM4A39H6123456');
    await page.getByRole('button', { name: 'Save vehicle' }).click();
    await expect(page.getByRole('radio', { name: new RegExp(plate) })).toBeChecked();

    // Submitting without cover shows the summary and moves focus.
    await page.getByRole('button', { name: 'Create the policy' }).click();
    await expect(page.getByTestId('error-summary')).toBeVisible();
    await page
      .getByRole('radio', { name: /MTPL|Compulsory/ })
      .first()
      .check();
    await expect(page.getByText(/AZN/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Create the policy' }).click();

    await expect(page.getByRole('heading', { name: /is ready to pay$/ })).toBeVisible();
    const policyNumber = (
      (await page.getByRole('heading', { name: /is ready to pay$/ }).textContent()) ?? ''
    )
      .replace(/^Policy /, '')
      .replace(/ is ready to pay$/, '');
    await page.getByRole('button', { name: /^Take payment of/ }).click();
    await expect(
      page.getByRole('heading', { name: `Policy ${policyNumber} is active` }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: 'All sales' }).click();
    await expect(page.getByText('1 policy', { exact: true })).toBeVisible();
    await expect(page.getByText(policyNumber).locator('visible=true')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^policies-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = readFileSync((await download.path()) ?? '');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes.subarray(3).toString('utf8').split('\r\n').filter(Boolean);
    expect(lines[0]).toMatch(/^Policy number,Status,Customer,Product,/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(
      `${policyNumber},Active,${customer.user.fullName},MTPL,Kia Rio 2021`,
    );
  });
});
