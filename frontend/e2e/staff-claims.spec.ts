import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminApi,
  clientWithClaim,
  expectNoHorizontalScroll,
  openSession,
  seedPreferences,
  staffApi,
} from './helpers';
import type { Session } from './helpers';

// The adjuster's desk against the real API: the queue, the review page and
// its decisions, a stale decision from a second session, a tampered request
// and the CSV export. The mobile project reruns this at 390px.

async function signedInAdjuster(page: Page) {
  const admin = await adminApi(page);
  const adjuster = await admin.createStaff('Adjuster');
  await seedPreferences(page, { lang: 'en', theme: 'dark' });
  await openSession(page, adjuster.session);
  return adjuster;
}

async function openClaim(page: Page, claimNumber: string, claimId: string) {
  await page.goto(`/app/claims/${claimId}`);
  await expect(page.getByRole('heading', { level: 1, name: `Claim ${claimNumber}` })).toBeVisible();
}

const decision = (page: Page) => page.getByRole('region', { name: 'Decision' });

test.describe('Adjuster claims desk', () => {
  test('finds a waiting claim in the queue, takes it and approves it', async ({ page }) => {
    const { claim, user } = await clientWithClaim(page, { claimedAmount: 850 });
    await signedInAdjuster(page);

    await page.goto('/app/claims');
    await expect(page.getByRole('link', { name: /Waiting for review/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('searchbox', { name: 'Search' }).fill(claim.claimNumber);
    await expect(page.getByText('1 claim', { exact: true })).toBeVisible();
    // Table on desktop, cards on phones: whichever is showing.
    await expect(page.getByText(user.fullName).locator('visible=true')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: claim.claimNumber }).locator('visible=true').click();

    const panel = decision(page);
    await expect(panel.getByText('Start the review first.').first()).toBeVisible();
    await panel.getByRole('button', { name: 'Start the review' }).click();
    await expect(page.getByText('The claim is in your review')).toBeVisible();

    await panel.getByRole('radio', { name: 'Approve' }).check();
    const amount = panel.getByRole('textbox', { name: 'Amount to approve' });
    await expect(amount).toHaveValue('850');
    await amount.fill('720,50');
    await panel.getByRole('textbox', { name: 'Note (optional)' }).fill('Photos match the report.');
    await panel.getByRole('button', { name: 'Approve the claim' }).click();

    await expect(page.getByText('Approved for 720.50 AZN')).toBeVisible();
    await expect(page.getByText('Under review', { exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Pay out 720.50 AZN' })).toBeVisible();
    await expect(page.getByText('Photos match the report.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await panel.getByRole('button', { name: 'Pay out 720.50 AZN' }).click();
    await expect(page.getByText('The claim is paid out')).toBeVisible();
    await expect(panel.getByText('The claim is already paid out.')).toBeVisible();
  });

  test('a rejection needs a reason, then reaches the customer', async ({ page }) => {
    const { claim, session: client } = await clientWithClaim(page);
    const adjuster = await signedInAdjuster(page);
    const api = staffApi(page, adjuster.session);
    expect((await api.post(`/api/claims/${claim.id}/review`)).status()).toBe(200);

    await openClaim(page, claim.claimNumber, claim.id);
    const panel = decision(page);
    await panel.getByRole('button', { name: 'Record the decision' }).click();
    await expect(page.getByTestId('error-summary')).toContainText('Choose approve or reject.');
    await expect(panel.getByRole('radio', { name: 'Approve' })).toBeFocused();

    await panel.getByRole('radio', { name: 'Reject' }).check();
    await panel.getByRole('button', { name: 'Reject the claim' }).click();
    const reason = panel.getByRole('textbox', { name: 'Reason for the rejection' });
    await expect(page.getByTestId('error-summary')).toContainText(
      'Give the reason for the rejection; the customer will read it.',
    );
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAttribute('aria-invalid', 'true');

    await reason.fill('The damage is older than the policy.');
    await panel.getByRole('button', { name: 'Reject the claim' }).click();
    await expect(page.getByText('The claim is rejected')).toBeVisible();
    await expect(panel.getByText('The claim already has a decision.').first()).toBeVisible();

    // The customer reads the same reason on their claim.
    const seen = await staffApi(page, client).claim(claim.id);
    expect(seen.claim.status).toBe('Rejected');
  });

  test('a decision on a stale claim reloads it and keeps the note', async ({ page, browser }) => {
    const { claim } = await clientWithClaim(page);
    const adjuster = await signedInAdjuster(page);
    expect(
      (await staffApi(page, adjuster.session).post(`/api/claims/${claim.id}/review`)).status(),
    ).toBe(200);

    // Two tabs of the same adjuster have the claim open.
    await openClaim(page, claim.claimNumber, claim.id);
    const other = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    const second = await other.newPage();
    await seedPreferences(second, { lang: 'en', theme: 'dark' });
    await openSession(second, adjuster.session);
    await openClaim(second, claim.claimNumber, claim.id);

    // The second tab approves first.
    await decision(second).getByRole('radio', { name: 'Approve' }).check();
    await decision(second).getByRole('button', { name: 'Approve the claim' }).click();
    await expect(second.getByText(/^Approved for/)).toBeVisible();
    await other.close();

    // The first tab, still on the old version, tries to reject.
    const panel = decision(page);
    await panel.getByRole('radio', { name: 'Reject' }).check();
    await panel.getByRole('textbox', { name: 'Reason for the rejection' }).fill('Not covered.');
    await panel.getByRole('button', { name: 'Reject the claim' }).click();

    await expect(
      panel.getByText('Someone else changed this claim while you had it open'),
    ).toBeVisible();
    await expect(panel.getByRole('textbox', { name: 'Your note (not sent)' })).toHaveValue(
      'Not covered.',
    );
    // The latest version is on screen: approved, so it can be paid, not rejected.
    await expect(panel.getByRole('button', { name: /^Pay out/ })).toBeVisible();
    await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('a tampered amount is refused by the server on the amount field', async ({ page }) => {
    const { claim } = await clientWithClaim(page, { claimedAmount: 600 });
    const adjuster = await signedInAdjuster(page);
    expect(
      (await staffApi(page, adjuster.session).post(`/api/claims/${claim.id}/review`)).status(),
    ).toBe(200);
    await openClaim(page, claim.claimNumber, claim.id);

    // The form allows 600; the request is rewritten on its way to 600.01.
    await page.route('**/api/claims/*/approve', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.continue({ postData: JSON.stringify({ ...body, approvedAmount: 600.01 }) });
    });
    const panel = decision(page);
    await panel.getByRole('radio', { name: 'Approve' }).check();
    await panel.getByRole('button', { name: 'Approve the claim' }).click();

    const amount = panel.getByRole('textbox', { name: 'Amount to approve' });
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(amount).toBeFocused();
    await expect(
      panel.getByText('The approved amount can’t be more than the claimed amount.', {
        exact: true,
      }),
    ).toBeVisible();
    expect((await staffApi(page, adjuster.session).claim(claim.id)).claim.status).toBe(
      'UnderReview',
    );
  });

  test('exports the filtered queue as UTF-8 CSV with formulas defused', async ({ page }) => {
    const { claim, user } = await clientWithClaim(page, { location: '=HYPERLINK("x","y")' });
    await signedInAdjuster(page);

    await page.goto(`/app/claims?q=${claim.claimNumber}`);
    await expect(page.getByText('1 claim', { exact: true })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^claims-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = readFileSync((await download.path()) ?? '');

    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes.subarray(3).toString('utf8').split('\r\n').filter(Boolean);
    expect(lines[0]).toMatch(/^Claim number,Status,Customer,Policy number,/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(claim.claimNumber);
    // Azerbaijani letters as written, and the formula shown as text.
    expect(lines[1]).toContain(user.fullName);
    expect(lines[1]).toContain('"\'=HYPERLINK(""x"",""y"")"');
  });

  test('works from the keyboard alone: queue, review, decision', async ({ page }) => {
    const { claim } = await clientWithClaim(page);
    await signedInAdjuster(page);
    await page.goto(`/app/claims?q=${claim.claimNumber}`);
    await expect(page.getByText('1 claim', { exact: true })).toBeVisible();

    // Tab to the claim's link and open it.
    const link = page.getByRole('link', { name: claim.claimNumber }).locator('visible=true');
    for (let i = 0; i < 40 && !(await link.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { level: 1, name: `Claim ${claim.claimNumber}` }),
    ).toBeVisible();

    const panel = decision(page);
    const start = panel.getByRole('button', { name: 'Start the review' });
    for (let i = 0; i < 60 && !(await start.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect(page.getByText('The claim is in your review')).toBeVisible();

    const approve = panel.getByRole('radio', { name: 'Approve' });
    for (
      let i = 0;
      i < 60 && !(await approve.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    // Arrow keys move within the radio group: Approve → Reject.
    await page.keyboard.press('ArrowRight');
    await expect(panel.getByRole('radio', { name: 'Reject' })).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('textbox', { name: 'Reason for the rejection' })).toBeFocused();
    await page.keyboard.type('Keyboard-only rejection reason.');
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('button', { name: 'Reject the claim' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('The claim is rejected')).toBeVisible();
  });
});

test.describe('Staff pages each role may not open', () => {
  const cases: {
    role: 'Agent' | 'Adjuster' | 'Client';
    paths: string[];
    nav: string[];
    hidden: string[];
  }[] = [
    {
      role: 'Adjuster',
      paths: ['/app/customers', '/app/sales', '/app/admin', '/app/buy', '/app/policies'],
      nav: ['Claims queue'],
      hidden: ['Customers', 'Sales', 'Administration'],
    },
    {
      role: 'Agent',
      paths: ['/app/claims', '/app/claims/00000000-0000-0000-0000-000000000000', '/app/admin'],
      nav: ['Customers', 'Sales'],
      hidden: ['Claims queue', 'Administration'],
    },
    {
      role: 'Client',
      paths: ['/app/customers', '/app/sales', '/app/admin'],
      nav: ['My claims'],
      hidden: ['Claims queue', 'Customers', 'Sales'],
    },
  ];

  for (const { role, paths, nav, hidden } of cases) {
    test(`${role}: staff areas outside the role show the 403 page`, async ({ page }) => {
      let session: Session;
      if (role === 'Client') {
        session = (await clientWithClaim(page)).session;
      } else {
        session = (await (await adminApi(page)).createStaff(role)).session;
      }
      await seedPreferences(page, { lang: 'en' });
      await openSession(page, session);

      for (const path of paths) {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { name: "This area isn't available for your role" }),
          path,
        ).toBeVisible();
      }

      // The sidebar (hidden on phones, so includeHidden) lists only the
      // role's own sections.
      await page.goto('/app');
      const link = (name: string) =>
        page
          .getByRole('navigation', { name: 'Your account', includeHidden: true })
          .first()
          .getByRole('link', { name, exact: true, includeHidden: true });
      for (const name of nav) await expect(link(name)).toHaveCount(1);
      for (const name of hidden) await expect(link(name)).toHaveCount(0);
    });
  }
});
