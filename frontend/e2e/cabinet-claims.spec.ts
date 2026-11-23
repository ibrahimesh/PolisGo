import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminApi,
  API_URL,
  cabinetApi,
  claimsApi,
  expectNoHorizontalScroll,
  FILES,
  isoToday,
  registerSession,
  seedPreferences,
  openSession,
} from './helpers';

const isClaimSubmit = (url: string, method: string) =>
  method === 'POST' && new URL(url).pathname === '/api/claims';

async function signedInClientWithPolicy(page: Page) {
  const { session, user } = await registerSession(page);
  const { vehicle, policy } = await cabinetApi(page, session).activePolicy();
  await openSession(page, session);
  return { session, user, vehicle, policy };
}

// Files the wizard keeps for the next reload (pendingFiles.ts).
function storedFileCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('polisgo', 1);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('claim-files').objectStore('claim-files').getAll();
          all.onsuccess = () => {
            resolve((all.result as unknown[][]).reduce((n, files) => n + files.length, 0));
            db.close();
          };
        };
        open.onerror = () => resolve(-1);
      }),
  );
}

async function fillIncident(page: Page, patch: Partial<Record<string, string>> = {}) {
  await page.getByLabel('Date of the incident').fill(patch.date ?? isoToday());
  await page.getByLabel('What happened', { exact: true }).selectOption(patch.type ?? 'Collision');
  await page.getByLabel('Where it happened').fill(patch.location ?? 'Baku, Nizami street 10');
  await page
    .getByLabel('Description')
    .fill(patch.description ?? 'Hit from behind while waiting at a red light.');
}

test.describe('Cabinet claims', () => {
  test.beforeEach(async ({ page }) => {
    await seedPreferences(page, { lang: 'en', theme: 'dark' });
  });

  test('file a claim end to end with photos', async ({ page }) => {
    const { vehicle } = await signedInClientWithPolicy(page);
    const submits: string[] = [];
    page.on('request', (r) => {
      if (isClaimSubmit(r.url(), r.method())) submits.push(r.url());
    });

    await page.goto('/app/claims');
    await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible();
    await page.getByRole('link', { name: 'File a claim' }).first().click();

    // 1. Policy
    await page.getByRole('radio', { name: new RegExp(vehicle.plateNumber) }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 2. Incident
    await expect(page.getByRole('heading', { name: 'What happened?' })).toBeFocused();
    await fillIncident(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    // 3. Damage
    await page.getByLabel('Estimated damage').fill('850,50');
    await page.getByRole('button', { name: 'Continue' }).click();

    // 4. Documents: two photos, a PDF, and a fake that is turned away.
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose files' }).click();
    await (
      await chooser
    ).setFiles([
      { name: 'front.png', mimeType: 'image/png', buffer: FILES.png },
      { name: 'rear.png', mimeType: 'image/png', buffer: FILES.png },
      { name: 'estimate.pdf', mimeType: 'application/pdf', buffer: FILES.pdf },
      { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: FILES.exe },
    ]);
    const list = page.getByRole('list', { name: 'Files to upload' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(page.getByText(/invoice\.pdf was not added: its content/)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '3 files added.' })).toBeAttached();

    // Removed before submit: never uploaded.
    await list.getByRole('button', { name: /Remove rear\.png/ }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);

    // A reload keeps the step, the answers and the picked files (once the
    // removal has reached IndexedDB).
    await expect.poll(() => storedFileCount(page)).toBe(2);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Photos and documents' })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Files to upload' }).getByRole('listitem'),
    ).toHaveCount(2);
    await page.getByRole('button', { name: 'Continue' }).click();

    // 5. Review, double-clicked: one claim only.
    await expect(page.getByText('850.50 AZN')).toBeVisible();
    await expect(page.getByText('2 files, uploaded after filing')).toBeVisible();
    await page.getByLabel(/I confirm that these details are true/).check();
    await page.getByRole('button', { name: 'File the claim' }).dblclick();

    await expect(page.getByRole('heading', { name: 'Claim filed' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('2 documents attached.')).toBeVisible();
    expect(submits).toHaveLength(1);
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: 'View the claim' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Claim CL-/);
    const documents = page.getByRole('region', { name: 'Documents' });
    const listed = documents.getByRole('listitem');
    await expect(listed).toHaveCount(2);
    await expect(documents.getByRole('button', { name: /Download front.png/ })).toBeVisible();
    await expect(documents.getByRole('button', { name: /Download rear.png/ })).toHaveCount(0);

    const download = page.waitForEvent('download');
    await documents.getByRole('button', { name: /Download estimate\.pdf/ }).click();
    expect((await download).suggestedFilename()).toBe('estimate.pdf');
    await expectNoHorizontalScroll(page);

    // The list shows it, filtered and searched.
    await page.goto('/app/claims?status=open');
    await expect(page.getByText('1 claim', { exact: true })).toBeVisible();
    await page.goto('/app/claims?status=Paid');
    await expect(page.getByRole('heading', { name: 'No claims match' })).toBeVisible();
  });

  test('validation on each step, on the client', async ({ page }) => {
    const { vehicle } = await signedInClientWithPolicy(page);
    await page.goto('/app/claims/new');

    // Nothing chosen: summary, and focus on the first choice.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('error-summary')).toContainText(
      'Choose the policy the claim is for.',
    );
    await page.getByRole('radio', { name: new RegExp(vehicle.plateNumber) }).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Continue' }).click();
    const summary = page.getByTestId('error-summary');
    await expect(summary).toContainText('Enter the date of the incident.');
    await expect(summary).toContainText('Choose what happened.');
    await expect(summary).toContainText('Enter where it happened, 3 to 200 characters.');
    await expect(summary).toContainText('Describe what happened in 10 to 2,000 characters.');
    await expect(page.getByLabel('Date of the incident')).toBeFocused();

    await fillIncident(page, { date: isoToday(1), description: 'Too short' });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByLabel('Date of the incident')).toHaveAccessibleDescription(
      "The incident date can't be in the future.",
    );
    await fillIncident(page, { date: isoToday(-10) });
    await page.getByRole('button', { name: 'Continue' }).click();
    // The policy started a week ago: ten days ago is outside the cover.
    await expect(page.getByLabel('Date of the incident')).toHaveAccessibleDescription(
      "The incident date must be within the policy's period of cover.",
    );
    await fillIncident(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    const amount = page.getByLabel('Estimated damage');
    for (const [value, message] of [
      ['0', 'The amount must be greater than zero.'],
      ['100.555', 'Use at most two decimal places.'],
      ['50000.01', 'Online claims go up to 50,000 AZN. For more, contact support.'],
      ['abc', 'Enter an amount in numbers, e.g. 850 or 850.50.'],
    ] as const) {
      await amount.fill(value);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(amount).toHaveAccessibleDescription(message);
      await expect(amount).toBeFocused();
    }
    await expectNoHorizontalScroll(page);
  });

  test('a policy that cannot take a claim is listed disabled with the reason', async ({ page }) => {
    const { session } = await registerSession(page);
    const api = cabinetApi(page, session);
    const draftVehicle = await api.vehicle();
    await api.policy(draftVehicle.id, 'CASCO', 12);
    const laterVehicle = await api.vehicle();
    const later = await api.policy(laterVehicle.id, 'MTPL', 12, isoToday(10));
    await api.pay(later.id);
    await openSession(page, session);

    await page.goto('/app/claims/new');
    const unpaid = page.getByRole('radio', { name: new RegExp(draftVehicle.plateNumber) });
    await expect(unpaid).toBeDisabled();
    await expect(unpaid).toHaveAccessibleDescription('Not paid yet, so there is no cover.');
    const notStarted = page.getByRole('radio', { name: new RegExp(laterVehicle.plateNumber) });
    await expect(notStarted).toBeDisabled();
    await expect(notStarted).toHaveAccessibleDescription(/^Cover starts on /);
    await expect(
      page.getByText('None of your policies can take a claim today; the reason is shown on each.'),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('a tampered request is rejected by the server on the right field', async ({ page }) => {
    const { vehicle } = await signedInClientWithPolicy(page);
    // Something between the form and the API rewrites the amount: the
    // server's 400 must come back onto the amount field, translated.
    await page.route(`${API_URL}/api/claims`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.continue({ postData: JSON.stringify({ ...body, claimedAmount: 100.555 }) });
    });
    await seedPreferences(page, { lang: 'ru', theme: 'dark' }, { override: true });

    await page.goto('/app/claims/new');
    await page.getByRole('radio', { name: new RegExp(vehicle.plateNumber) }).check();
    await page.getByRole('button', { name: 'Продолжить' }).click();
    await page.getByLabel('Дата происшествия').fill(isoToday());
    await page.getByLabel('Что произошло', { exact: true }).selectOption('Glass');
    await page.getByLabel('Место происшествия').fill('Баку, проспект Нефтяников');
    await page.getByLabel('Описание').fill('Камень с грузовика разбил лобовое стекло.');
    await page.getByRole('button', { name: 'Продолжить' }).click();
    await page.getByLabel('Оценка ущерба').fill('300');
    await page.getByRole('button', { name: 'Продолжить' }).click();
    await page.getByRole('button', { name: 'Продолжить без документов' }).click();
    await page.getByLabel(/Подтверждаю/).check();
    await page.getByRole('button', { name: 'Подать заявление' }).click();

    const amount = page.getByLabel('Оценка ущерба');
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAccessibleDescription('Не больше двух знаков после запятой.');
    await expect(page.getByRole('heading', { name: 'Каков ущерб?' })).toBeVisible();
  });

  test('withdraw an open claim, with a confirm dialog', async ({ page }) => {
    const { session, policy } = await signedInClientWithPolicy(page);
    const claim = await claimsApi(page, session).file(policy.id);

    await page.goto(`/app/claims/${claim.id}`);
    await page.getByRole('button', { name: 'Withdraw claim' }).click();
    const dialog = page.getByRole('dialog', { name: `Withdraw claim ${claim.claimNumber}?` });
    await expect(dialog).toBeVisible();

    // Too long a reason is stopped on the client.
    await dialog.getByLabel('Reason (optional)').fill('x'.repeat(501));
    await dialog.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(dialog.getByLabel('Reason (optional)')).toHaveAccessibleDescription(
      /Keep the reason to 500 characters\./,
    );

    // Cancelling keeps the claim open.
    await dialog.getByRole('button', { name: 'Keep the claim' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Withdraw claim' })).toBeFocused();

    await page.getByRole('button', { name: 'Withdraw claim' }).click();
    await dialog.getByLabel('Reason (optional)').fill('Settled with the other driver.');
    await dialog.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText(`Claim ${claim.claimNumber} withdrawn.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Withdraw claim' })).toHaveCount(0);
    const timeline = page.getByRole('region', { name: 'History' });
    await expect(timeline.getByText('Withdrawn', { exact: true })).toBeVisible();
    await expect(timeline.getByText('Settled with the other driver.')).toBeVisible();
    await expect(
      page.getByText('Documents can only be added while the claim is open.'),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the timeline shows the history, and the bell the update', async ({ page }) => {
    const { session, policy } = await signedInClientWithPolicy(page);
    const claim = await claimsApi(page, session).file(policy.id, { claimedAmount: 900 });
    const admin = await adminApi(page);
    await admin.act(claim.id, 'review', { comment: 'Looking at the photos.' });
    await admin.act(claim.id, 'approve', { approvedAmount: 850, comment: 'Minus the excess.' });

    await page.goto('/app');
    await expect(page.getByText('1 claim has an update.')).toBeVisible();
    await page.getByRole('button', { name: /^Notifications, 1 unread/ }).click();
    const panel = page.getByRole('region', { name: 'Updates' });
    await expect(
      panel.getByRole('link', { name: `Claim ${claim.claimNumber} was approved` }),
    ).toBeVisible();
    await expect(panel.getByText('Minus the excess.')).toBeVisible();
    await panel.getByRole('link', { name: `Claim ${claim.claimNumber} was approved` }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Claim ${claim.claimNumber}`);
    await expect(page.getByRole('heading', { name: /^Approved for 850\.00 AZN/ })).toBeVisible();
    const timeline = page.getByRole('region', { name: 'History' }).getByRole('listitem');
    await expect(timeline).toHaveCount(3);
    await expect(timeline.nth(0)).toContainText('Claim filed');
    await expect(timeline.nth(0)).toContainText('by you');
    await expect(timeline.nth(1)).toContainText('Taken into review');
    await expect(timeline.nth(1)).toContainText('Looking at the photos.');
    await expect(timeline.nth(2)).toContainText('Approved');
    await expect(page.getByRole('button', { name: 'Withdraw claim' })).toHaveCount(0);

    // Opening the claim read the update: the bell has nothing unread.
    await expect(page.getByRole('button', { name: 'Notifications, none unread' })).toBeVisible();
  });

  test("another client's claim is not found", async ({ page }) => {
    const owner = await registerSession(page);
    const { policy } = await cabinetApi(page, owner.session).activePolicy();
    const claim = await claimsApi(page, owner.session).file(policy.id);

    const { session } = await registerSession(page);
    await openSession(page, session);
    await page.goto(`/app/claims/${claim.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("This claim wasn't found");
    await expect(page.getByText(claim.claimNumber)).toHaveCount(0);
  });

  test('keyboard only: choose, fill, attach and remove a file', async ({ page }) => {
    const { vehicle } = await signedInClientWithPolicy(page);
    await page.goto('/app/claims/new');

    const radio = page.getByRole('radio', { name: new RegExp(vehicle.plateNumber) });
    await radio.focus();
    await page.keyboard.press('Space');
    await expect(radio).toBeChecked();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'What happened?' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Date of the incident')).toBeFocused();
    await page.getByLabel('Date of the incident').fill(isoToday());
    // Chrome's date input tabs through its day, month and year parts first.
    const type = page.getByLabel('What happened', { exact: true });
    for (let i = 0; i < 5 && !(await type.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab');
    await expect(type).toBeFocused();
    await page.getByLabel('What happened', { exact: true }).selectOption('Theft');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Ganja, Ataturk avenue');
    await page.keyboard.press('Tab');
    await page.keyboard.type('The car was broken into overnight.');
    await page.keyboard.press('Enter'); // a newline in the description, not a submit
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
    await page.keyboard.press('Enter');

    // Each step starts on its heading; Tab goes on from there.
    await expect(page.getByRole('heading', { name: 'How much is the damage?' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Estimated damage')).toBeFocused();
    await page.keyboard.type('1200');
    await page.keyboard.press('Enter');

    // The uploader: the file picker opens from the keyboard.
    await expect(page.getByRole('heading', { name: 'Photos and documents' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Choose files' })).toBeFocused();
    // Enter must reach the (hidden) file input. Headless Chrome doesn't
    // always raise the native picker for a keyboard activation, so the test
    // checks the click and then hands the file to the input itself.
    const input = page.locator('input[type=file]');
    await input.evaluate((el) => {
      el.addEventListener('click', () => el.setAttribute('data-opened', 'true'), { once: true });
    });
    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('data-opened', 'true');
    await input.setInputFiles([{ name: 'door.png', mimeType: 'image/png', buffer: FILES.png }]);
    const remove = page.getByRole('button', { name: /Remove door\.png/ });
    await expect(remove).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(remove).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('list', { name: 'Files to upload' })).toHaveCount(0);
  });
});
