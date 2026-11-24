import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminApi,
  API_URL,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  openSession,
  seedPreferences,
  waitForSettled,
} from './helpers';
import type { Session } from './helpers';

// The System section, end to end: a user sees a Reference on an error, the
// admin pastes it and lands on that error, resolves it, and sees it come
// back as regressed when it happens again. The error reporter is off in the
// e2e suite unless a test turns it on (polisgo.e2e.reporter).

async function signedInAdmin(page: Page, theme: 'dark' | 'light' = 'dark') {
  const admin = await (await adminApi(page)).createStaff('Admin');
  await seedPreferences(page, { lang: 'en', theme }, { override: true });
  await page.addInitScript(() => localStorage.setItem('polisgo.e2e.reporter', 'on'));
  await openSession(page, admin.session);
  return admin.session;
}

// The writer stores errors off the request path: wait until the Reference
// can be looked up before going through the UI.
async function stored(page: Page, session: Session, code: string) {
  await expect
    .poll(
      async () =>
        (
          await page.request.get(`${API_URL}/api/admin/errors/lookup`, {
            headers: { Authorization: `Bearer ${session.token}` },
            params: { reference: code },
          })
        ).status(),
      { timeout: 15_000 },
    )
    .toBe(200);
}

async function referenceOn(page: Page) {
  const chip = page.getByTestId('reference-chip').first();
  await expect(chip).toBeVisible();
  const code = /[0-9A-F]{8}/.exec((await chip.textContent()) ?? '')?.[0];
  expect(code, 'a Reference on the page').toBeTruthy();
  return code ?? '';
}

test('a 500 a user saw is found by its Reference, resolved, and comes back as regressed', async ({
  page,
}) => {
  const session = await signedInAdmin(page);

  // What a user sees: the error notice with its Reference.
  await page.goto('/app/__e2e/server-error');
  const code = await referenceOn(page);
  await stored(page, session, code);

  // The admin pastes it, as quoted (a dash and lower case are fine).
  await page.goto('/app/admin/system');
  await expect(page.getByRole('heading', { level: 1, name: 'System' })).toBeVisible();
  const lookup = page.getByRole('textbox', { name: 'Reference' });
  await lookup.fill(`${code.slice(0, 4)}-${code.slice(4).toLowerCase()}`);
  await page.getByRole('button', { name: 'Find' }).click();

  await expect(page).toHaveURL(/\/app\/admin\/system\/errors\/[0-9a-f-]{36}\?occurrence=/);
  const main = page.getByRole('main');
  await expect(main.getByText(`Found by Reference ${code}`)).toBeVisible();
  const marked = main.getByTestId('error-occurrence').filter({ hasText: 'The one you looked up' });
  await expect(marked.getByTestId('reference-chip')).toContainText(code);
  await expect(main.getByText('POST api/diagnostics/test-failure').first()).toBeVisible();
  // Redacted at rest: the fake email, token and card never reach the page.
  await expect(main).not.toContainText('@polisgo.test');
  await expect(main).not.toContainText('eyJ');
  await expect(main).not.toContainText('4111');
  await expect(main.getByText('[email]').first()).toBeVisible();

  // Resolve with a note.
  const triage = main.getByRole('region', { name: 'Status' });
  await triage.getByRole('textbox', { name: 'Note (optional)' }).fill('Fixed in the e2e build');
  await triage.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(triage.getByText('Resolved', { exact: true })).toBeVisible();
  await expect(triage.getByText('Fixed in the e2e build')).toBeVisible();

  // It happens again: reopened by the system and flagged.
  const again = await page.request.post(`${API_URL}/api/diagnostics/test-failure`);
  expect(again.status()).toBe(500);
  const againCode = ((await again.json()) as { traceId: string }).traceId.slice(3, 11).toUpperCase();
  await stored(page, session, againCode);
  await page.reload();
  await expect(main.getByText('Regressed').first()).toBeVisible();
  await expect(main.getByText(/happened again .*: reopened automatically/)).toBeVisible();
  await expect(triage.getByText('New', { exact: true })).toBeVisible();

  // The triage is in the audit log.
  await page.goto('/app/admin/audit?type=Error');
  await expect(page.getByRole('region', { name: 'Events' }).getByText('marked resolved').first()).toBeVisible();
});

test('a crash in the browser gets a Reference the admin finds from the palette', async ({ page }) => {
  const session = await signedInAdmin(page);

  await page.goto('/app/__e2e/crash');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something broke on our side.');
  const code = await referenceOn(page);
  await stored(page, session, code);

  await page.goto('/app/admin/system');
  await waitForSettled(page);
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox').fill(code.toLowerCase());
  const option = palette.getByRole('option', { name: `Find error ${code}` });
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');

  const main = page.getByRole('main');
  await expect(main.getByText('Browser', { exact: true }).first()).toBeVisible();
  await expect(main.getByText('Deliberate crash for the error boundary test.').first()).toBeVisible();
  await expect(
    main.getByTestId('error-occurrence').filter({ hasText: 'The one you looked up' }),
  ).toContainText('/app/__e2e/crash');
});

test('the errors list finds a Reference, says when nothing matches, and fits a phone', async ({
  page,
}) => {
  const session = await signedInAdmin(page);
  const failure = await page.request.post(`${API_URL}/api/diagnostics/test-failure`);
  const code = ((await failure.json()) as { traceId: string }).traceId.slice(3, 11).toUpperCase();
  await stored(page, session, code);

  await page.goto('/app/admin/system/errors');
  const search = page.getByRole('searchbox', { name: 'Search' });
  await search.fill(` ${code.slice(0, 4)} ${code.slice(4)} `);
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByTestId('errors-count')).toHaveText('1 error group');
  await expect(page.getByRole('main').getByRole('link', { name: /Deliberate failure/ })).toHaveCount(1);
  await expectNoHorizontalScroll(page);

  await search.fill('ZZZZZZZZ-no-such');
  await expect(page.getByRole('heading', { name: 'Nothing matches' })).toBeVisible();
  await search.press('Escape');
  await expect(page).not.toHaveURL(/q=/);
});

for (const theme of ['dark', 'light'] as const) {
  test(`the System pages pass axe (${theme})`, async ({ page }) => {
    const session = await signedInAdmin(page, theme);
    await page.request.post(`${API_URL}/api/diagnostics/test-failure`);

    await page.goto('/app/admin/system');
    await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible();
    await expect(page.getByText('Reachable')).toBeVisible();
    await waitForSettled(page);
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);

    await page.goto('/app/admin/system/errors');
    await expect(page.getByTestId('errors-count')).toHaveText(/error group/);
    await waitForSettled(page);
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);

    const list = await page.request.get(`${API_URL}/api/admin/errors`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const { items } = (await list.json()) as { items: { id: string }[] };
    await page.goto(`/app/admin/system/errors/${items[0]?.id ?? ''}`);
    await expect(page.getByRole('heading', { name: 'Recent occurrences' })).toBeVisible();
    await page.getByText('Stack trace').first().click();
    await waitForSettled(page);
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);
  });
}
