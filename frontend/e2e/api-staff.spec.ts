import { expect, test } from '@playwright/test';
import type { APIResponse } from '@playwright/test';
import { adminApi, API_URL, clientWithClaim, registerSession, staffApi } from './helpers';

// The staff endpoints' rules against SQL Server, where column lengths and
// collation are real (the backend tests run on SQLite).

async function expectFieldError(response: APIResponse, field: string, message: string) {
  expect(response.status(), await response.text()).toBe(400);
  const problem = (await response.json()) as {
    traceId?: string;
    errors?: Record<string, string[]>;
  };
  expect(problem.traceId).toBeTruthy();
  expect(problem.errors?.[field]?.[0]).toBe(message);
}

test.describe('Staff API on SQL Server', () => {
  test('decision fields at and past their limits', async ({ page }) => {
    const admin = await adminApi(page);
    const adjuster = await admin.createStaff('Adjuster');
    const api = staffApi(page, adjuster.session);
    const { claim } = await clientWithClaim(page, { claimedAmount: 500 });
    expect((await api.post(`/api/claims/${claim.id}/review`)).status()).toBe(200);
    const url = `/api/claims/${claim.id}`;

    await expectFieldError(
      await api.post(`${url}/reject`, { comment: ' ' }),
      'comment',
      'A rejection reason is required.',
    );
    await expectFieldError(
      await api.post(`${url}/reject`, { comment: 'r'.repeat(1001) }),
      'comment',
      'Comment must be at most 1000 characters.',
    );
    await expectFieldError(
      await api.post(`${url}/approve`, { approvedAmount: 500.01 }),
      'approvedAmount',
      'Approved amount cannot exceed the claimed amount.',
    );
    // decimal(18,2) would round this silently.
    await expectFieldError(
      await api.post(`${url}/approve`, { approvedAmount: 100.005 }),
      'approvedAmount',
      'Approved amount can have at most two decimal places.',
    );
    await expectFieldError(
      await api.post(`${url}/approve`, { approvedAmount: -1 }),
      'approvedAmount',
      'Approved amount must be greater than zero.',
    );

    // The longest reason fits the column.
    const rejected = await api.post(`${url}/reject`, { comment: 'r'.repeat(1000) });
    expect(rejected.status(), await rejected.text()).toBe(200);
  });

  test('a decision on a stale rowVersion is a 409 "Concurrent update"', async ({ page }) => {
    const admin = await adminApi(page);
    const adjuster = await admin.createStaff('Adjuster');
    const api = staffApi(page, adjuster.session);
    const { claim } = await clientWithClaim(page);
    const seen = (await api.claim(claim.id)).claim.rowVersion;

    expect((await api.post(`/api/claims/${claim.id}/review`, { rowVersion: seen })).status()).toBe(
      200,
    );
    const stale = await api.post(`/api/claims/${claim.id}/reject`, {
      comment: 'Not covered.',
      rowVersion: seen,
    });
    expect(stale.status()).toBe(409);
    const problem = (await stale.json()) as { title: string; traceId: string };
    expect(problem.title).toBe('Concurrent update');
    expect(problem.traceId).toBeTruthy();
    expect((await api.claim(claim.id)).claim.status).toBe('UnderReview');
  });

  test('a client gets 403 on every staff endpoint; an agent cannot decide', async ({ page }) => {
    const { claim, session } = await clientWithClaim(page);
    const client = staffApi(page, session);
    const calls = [
      client.get('/api/customers'),
      client.get('/api/staff/overview'),
      client.get('/api/claims/export'),
      client.get('/api/policies/export'),
      page.request.put(`${API_URL}/api/customers/${crypto.randomUUID()}/agent`, {
        headers: client.headers,
        data: { agentId: null },
      }),
      ...['review', 'approve', 'reject', 'pay'].map((action) =>
        client.post(`/api/claims/${claim.id}/${action}`, { comment: 'x', approvedAmount: 1 }),
      ),
    ];
    for (const response of await Promise.all(calls)) {
      expect(response.status(), response.url()).toBe(403);
    }

    const agent = staffApi(page, (await (await adminApi(page)).createStaff('Agent')).session);
    for (const action of ['review', 'approve', 'reject', 'pay']) {
      const response = await agent.post(`/api/claims/${claim.id}/${action}`, {
        comment: 'x',
        approvedAmount: 1,
      });
      expect(response.status(), action).toBe(403);
    }
  });

  test('directory scope: own book, case-insensitive Azerbaijani letters and phone digits', async ({ page }) => {
    const admin = await adminApi(page);
    const agent = await admin.createStaff('Agent');
    const other = await admin.createStaff('Agent');
    const adjuster = await admin.createStaff('Adjuster');
    const mine = await registerSession(page);
    const theirs = await registerSession(page);
    const mineId = await admin.customerIdFor(mine.user.email);
    const theirsId = await admin.customerIdFor(theirs.user.email);
    await admin.assignAgent(mineId, agent.id);
    await admin.assignAgent(theirsId, other.id);

    const api = staffApi(page, agent.session);
    const search = async (term: string) =>
      (
        (await (await api.get(`/api/customers?search=${encodeURIComponent(term)}`)).json()) as {
          items: { id: string }[];
        }
      ).items.map((item) => item.id);

    // Lower-case Azerbaijani letters find the upper-case name on SQL Server.
    const surname = mine.user.fullName.split(' ').at(-1) ?? '';
    expect(await search(surname.toLowerCase())).toEqual([mineId]);
    expect(await search('məmmədova ' + surname.toLowerCase())).toEqual([mineId]);
    // Phone digits, typed with spaces.
    expect(await search('50 123 45 67')).toContain(mineId);
    expect(await search('50 123 45 67')).not.toContain(theirsId);
    expect(await search(theirs.user.email)).toEqual([]);
    expect((await api.get(`/api/customers/${theirsId}`)).status()).toBe(404);

    // An adjuster sees neither: no claim of theirs is in the queue.
    const adjusterApi = staffApi(page, adjuster.session);
    expect((await adjusterApi.get(`/api/customers/${mineId}`)).status()).toBe(404);
  });

  test('assigning a customer: only to an agent, only by an admin', async ({ page }) => {
    const admin = await adminApi(page);
    const adjuster = await admin.createStaff('Adjuster');
    const { user } = await registerSession(page);
    const customerId = await admin.customerIdFor(user.email);

    await expectFieldError(
      await page.request.put(`${API_URL}/api/customers/${customerId}/agent`, {
        headers: admin.headers,
        data: { agentId: adjuster.id },
      }),
      'agentId',
      'No agent with this id.',
    );
    const unknown = await page.request.put(
      `${API_URL}/api/customers/${crypto.randomUUID()}/agent`,
      {
        headers: admin.headers,
        data: { agentId: null },
      },
    );
    expect(unknown.status()).toBe(404);
  });

  test('claims export keeps Azerbaijani names intact with a BOM', async ({ page }) => {
    const admin = await adminApi(page);
    const adjuster = await admin.createStaff('Adjuster');
    const { claim, user } = await clientWithClaim(page, { location: '+994 street, "quoted"' });

    const response = await page.request.get(
      `${API_URL}/api/claims/export?search=${encodeURIComponent(claim.claimNumber)}`,
      { headers: staffApi(page, adjuster.session).headers },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    const bytes = await response.body();
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.subarray(3).toString('utf8');
    expect(text).toContain(user.fullName);
    expect(text).toContain('"\'+994 street, ""quoted"""');
  });
});
