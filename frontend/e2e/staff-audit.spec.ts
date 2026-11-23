import { expect, test } from '@playwright/test';
import { adminApi, API_URL, expectNoAxeViolations, openSession, seedPreferences } from './helpers';

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

  const count = page.getByText(/^\d[\d,]* events?$/);
  await expect(count).toBeVisible();
  const before = Number((await count.textContent())?.replace(/\D/g, ''));
  expect(before).toBeGreaterThan(1);

  const search = page.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill(agent.email.toUpperCase());
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(agent.email.toUpperCase())}`));
  await expect(count).toHaveText('1 event');
  const events = page.getByRole('list').filter({ hasText: agent.email }).getByRole('listitem');
  await expect(events).toHaveCount(1);
  await expect(events.first()).toContainText('account created as Agent');
  await expectNoAxeViolations(page);

  // The URL carries the search: a reload shows the same result.
  await page.reload();
  await expect(search).toHaveValue(agent.email.toUpperCase());
  await expect(count).toHaveText('1 event');

  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page).not.toHaveURL(/q=/);
  await expect(count).not.toHaveText('1 event');

  await search.fill('no-such-thing-zz');
  await expect(page.getByRole('heading', { name: 'Nothing matches' })).toBeVisible();
  await expect(
    page.getByText('No event mentions “no-such-thing-zz”.', { exact: false }),
  ).toBeVisible();
  await expect(count).toHaveText('0 events');
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
