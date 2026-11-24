import { expect, test } from '@playwright/test';
import {
  adminApi,
  API_URL,
  expectNoAxeViolations,
  openSession,
  registerSession,
  seedPreferences,
  waitForSettled,
} from './helpers';

// Typing an email used to leave every event listed: the page had no search
// and the API none either. Now the box narrows the feed (debounced), the
// URL follows, the count updates, Clear restores it and a miss says so.
test('the audit search narrows by email, keeps the URL and clears', async ({ page }) => {
  await seedPreferences(page, { lang: 'en', theme: 'dark' });
  const api = await adminApi(page);
  const admin = await api.createStaff('Admin');
  const agent = await api.createStaff('Agent');
  await openSession(page, admin.session);
  await page.goto('/app/admin/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();

  const count = page.getByTestId('audit-count');
  await expect(count).toHaveText(/^\d[\d,]* events?$/);
  const before = Number((await count.textContent())?.replace(/\D/g, ''));
  expect(before).toBeGreaterThan(1);

  const search = page.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill(agent.email.toUpperCase());
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(agent.email.toUpperCase())}`));
  await expect(count).toHaveText(`1 event matches “${agent.email.toUpperCase()}”`);
  const events = page.getByRole('list').filter({ hasText: agent.email }).getByRole('listitem');
  await expect(events).toHaveCount(1);
  await expect(events.first()).toContainText('account created as Agent');
  await expectNoAxeViolations(page);

  // The URL carries the search: a reload shows the same result.
  await page.reload();
  await expect(search).toHaveValue(agent.email.toUpperCase());
  await expect(count).toHaveText(`1 event matches “${agent.email.toUpperCase()}”`);

  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page).not.toHaveURL(/q=/);
  await expect(count).toHaveText(/^\d[\d,]* events$/);

  await search.fill('no-such-thing-zz');
  await expect(page.getByRole('heading', { name: 'Nothing matches' })).toBeVisible();
  await expect(
    page.getByText('No event mentions “no-such-thing-zz”.', { exact: false }),
  ).toBeVisible();
  await expect(count).toHaveText('0 events match “no-such-thing-zz”');
  // Escape clears the box too.
  await search.press('Escape');
  await expect(search).toHaveValue('');
});

test('the audit search finds actions by their translated name', async ({ page }) => {
  await seedPreferences(page, { lang: 'ru' });
  const api = await adminApi(page);
  const admin = await api.createStaff('Admin');
  const agent = await api.createStaff('Agent');
  const changed = await page.request.put(`${API_URL}/api/users/${agent.id}/role`, {
    headers: { Authorization: `Bearer ${admin.session.token}` },
    data: { role: 'Adjuster' },
  });
  expect(changed.status()).toBe(200);
  await openSession(page, admin.session);
  await page.goto(`/app/admin/audit?actor=${admin.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Поиск', exact: true }).fill('роль:');
  const events = page.locator('ol > li');
  await expect(events).toHaveCount(1);
  await expect(events.first()).toContainText('роль: Агент → Аджастер');
});

// The owner typed "ibrahim" into a log of ~2,450 events and the page still
// said "2452 events", unrelated rows first: the API it ran against predated
// the search, and SQL's UPPER() can't match İ, ə or Cyrillic anyway. Here a
// name with Azerbaijani letters is typed in capitals into a log that holds
// every earlier test run's events: the count is the filtered one and every
// row is about that person.
test('a typed name narrows a full log to the events about that person', async ({ page }) => {
  await seedPreferences(page, { lang: 'en', theme: 'dark' });
  const api = await adminApi(page);
  const tag = Array.from({ length: 6 }, () =>
    'bcdfghjklmnpqrstvwxz'.charAt(Math.floor(Math.random() * 20)),
  ).join('');
  const surname = `Qəhrəmanlı${tag}`;
  const agent = await api.createStaff('Agent', `İlkin ${surname}`);
  const { user: client } = await registerSession(page);
  await api.assignAgent(await api.customerIdFor(client.email), agent.id);
  const admin = await api.createStaff('Admin');
  await openSession(page, admin.session);
  await page.goto('/app/admin/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();

  const count = page.getByTestId('audit-count');
  await expect(count).toHaveText(/^\d[\d,]* events?$/);
  const search = page.getByRole('searchbox', { name: 'Search', exact: true });
  // Capitals, dotless/dotted I and ə: "QƏHRƏMANLI…" must find "Qəhrəmanlı…".
  const typed = surname.toLocaleUpperCase('az');
  await search.pressSequentially(typed, { delay: 20 });
  await expect(count).toHaveText(`2 events match “${typed}”`);
  const rows = page.getByRole('region', { name: 'Events' }).locator('ol > li');
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) {
    const text = (await row.textContent()) ?? '';
    expect(text.includes(agent.fullName) || text.includes(agent.email), text).toBe(true);
  }
  // Newest first: the assignment came after the account.
  await expect(rows.nth(0)).toContainText(`assigned to ${agent.fullName}`);
  await expect(rows.nth(1)).toContainText('account created as Agent');

  // One clear button, the field's own.
  const field = page.locator('#audit-search').locator('..');
  await expect(field.getByRole('button')).toHaveCount(1);
  await expect(field.getByRole('button', { name: 'Clear search' })).toBeVisible();
  // No browser X beside it: that comes only with type="search".
  await expect(search).toHaveAttribute('type', 'text');

  // The Actor control is a picker, not a second search box: a combobox
  // whose list is searched by name, chosen with the keyboard.
  await expect(page.getByRole('searchbox')).toHaveCount(1);
  const actor = page.getByRole('combobox', { name: 'Actor' });
  await actor.fill(surname.toLowerCase());
  const option = page.getByRole('listbox', { name: 'Actor' }).getByRole('option', {
    name: new RegExp(agent.fullName),
  });
  await expect(option).toBeVisible();
  await waitForSettled(page);
  await expectNoAxeViolations(page);
  await actor.press('ArrowDown');
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await actor.press('Enter');
  await expect(page).toHaveURL(new RegExp(`actor=${agent.id}`));
  await expect(actor).toHaveValue(agent.fullName);
  // The agent acted on nothing: the search and the actor together match none.
  await expect(page.getByRole('heading', { name: 'Nothing matches' })).toBeVisible();
  await expect(count).toHaveText(`0 events match “${typed}”`);
});
