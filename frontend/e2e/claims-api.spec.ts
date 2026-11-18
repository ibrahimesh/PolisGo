import { expect, test } from '@playwright/test';
import type { APIResponse, Page } from '@playwright/test';
import {
  adminApi,
  API_URL,
  cabinetApi,
  claimBody,
  claimsApi,
  FILES,
  registerSession,
} from './helpers';

// Field lengths and constraints against the real API on SQL Server. The
// backend's own tests run on SQLite, which ignores column lengths: an
// over-long value there "works" and here was a 500. Each case sits just
// inside and just outside the limit.

async function client(page: Page) {
  const { session } = await registerSession(page);
  const { policy } = await cabinetApi(page, session).activePolicy();
  const headers = { Authorization: `Bearer ${session.token}` };
  return { session, policy, headers };
}

async function expectFieldError(response: APIResponse, field: string, message: string) {
  expect(response.status(), await response.text()).toBe(400);
  const problem = (await response.json()) as {
    traceId?: string;
    errors?: Record<string, string[]>;
  };
  expect(problem.traceId).toBeTruthy();
  expect(problem.errors?.[field]?.[0]).toBe(message);
}

test.describe('Claims API on SQL Server', () => {
  test('text fields at and past their column lengths', async ({ page }) => {
    const { policy, headers } = await client(page);
    const post = (patch: Record<string, unknown>) =>
      page.request.post(`${API_URL}/api/claims`, { headers, data: claimBody(policy.id, patch) });

    const longest = await post({
      location: 'L'.repeat(200),
      description: 'D'.repeat(2000),
      claimedAmount: 50_000,
    });
    expect(longest.status(), await longest.text()).toBe(201);
    const stored = (await longest.json()) as { location: string; description: string };
    expect(stored.location).toHaveLength(200);
    expect(stored.description).toHaveLength(2000);

    await expectFieldError(
      await post({ location: 'L'.repeat(201) }),
      'Location',
      'Location must be between 3 and 200 characters.',
    );
    await expectFieldError(
      await post({ description: 'D'.repeat(2001) }),
      'Description',
      'Description must be between 10 and 2000 characters.',
    );
    // decimal(18,2) would round this silently.
    await expectFieldError(
      await post({ claimedAmount: 100.555 }),
      'ClaimedAmount',
      'Claimed amount can have at most two decimal places.',
    );
    await expectFieldError(
      await post({ incidentType: null }),
      'IncidentType',
      'Incident type is required.',
    );
  });

  test('history comments: the 1000-character column, staff and client', async ({ page }) => {
    const { session, policy, headers } = await client(page);
    const first = await claimsApi(page, session).file(policy.id);
    const admin = await adminApi(page);

    // Before the fix this was an unhandled DbUpdateException: a 500.
    await expectFieldError(
      await admin.post(`/api/claims/${first.id}/review`, { comment: 'c'.repeat(1001) }),
      'comment',
      'Comment must be at most 1000 characters.',
    );
    expect(
      (await admin.post(`/api/claims/${first.id}/review`, { comment: 'c'.repeat(1000) })).status(),
    ).toBe(200);

    const second = await claimsApi(page, session).file(policy.id);
    await expectFieldError(
      await page.request.post(`${API_URL}/api/claims/${second.id}/withdraw`, {
        headers,
        data: { reason: 'r'.repeat(501) },
      }),
      'Reason',
      'Reason must be at most 500 characters.',
    );
    const withdrawn = await page.request.post(`${API_URL}/api/claims/${second.id}/withdraw`, {
      headers,
      data: { reason: 'r'.repeat(500) },
    });
    expect(withdrawn.status(), await withdrawn.text()).toBe(200);
  });

  test('uploads: names, types and content checked by the server', async ({ page }) => {
    const { session, policy, headers } = await client(page);
    const claim = await claimsApi(page, session).file(policy.id);
    const upload = (name: string, buffer: Buffer, mimeType = 'image/png') =>
      page.request.post(`${API_URL}/api/claims/${claim.id}/documents`, {
        headers,
        multipart: { file: { name, mimeType, buffer } },
      });

    // A 300-character name is cut to the 255 the column holds, keeping the type.
    const long = await upload(`${'n'.repeat(296)}.png`, FILES.png);
    expect(long.status(), await long.text()).toBe(201);
    const longName = ((await long.json()) as { fileName: string }).fileName;
    expect(longName.length).toBeLessThanOrEqual(255);
    expect(longName.endsWith('.png')).toBe(true);

    // Traversal segments never reach storage or the stored name.
    const traversal = await upload('../../../etc/passwd.png', FILES.png);
    expect(traversal.status()).toBe(201);
    expect(((await traversal.json()) as { fileName: string }).fileName).toBe('passwd.png');

    // The declared content type is the client's claim; the bytes decide.
    await expectFieldError(
      await upload('invoice.pdf', FILES.exe, 'application/pdf'),
      'file',
      'File content does not match the declared extension.',
    );
    await expectFieldError(
      await upload('photo.gif', FILES.gif, 'image/png'),
      'file',
      'Only .jpg, .jpeg, .png and .pdf files are accepted.',
    );
  });

  test("another client's claim: read, download, upload and withdraw all 404", async ({ page }) => {
    const owner = await client(page);
    const claim = await claimsApi(page, owner.session).file(owner.policy.id);
    const document = await claimsApi(page, owner.session).upload(claim.id, 'front.png', FILES.png);

    const { session } = await registerSession(page);
    const headers = { Authorization: `Bearer ${session.token}` };
    const responses = await Promise.all([
      page.request.get(`${API_URL}/api/claims/${claim.id}`, { headers }),
      page.request.get(`${API_URL}/api/claims/${claim.id}/history`, { headers }),
      page.request.get(`${API_URL}/api/claims/${claim.id}/documents/${document.id}`, { headers }),
      page.request.post(`${API_URL}/api/claims/${claim.id}/documents`, {
        headers,
        multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: FILES.png } },
      }),
      page.request.post(`${API_URL}/api/claims/${claim.id}/withdraw`, { headers, data: {} }),
      page.request.post(`${API_URL}/api/me/claim-updates/${claim.id}/read`, { headers }),
    ]);
    for (const response of responses) {
      expect(response.status(), response.url()).toBe(404);
      expect(response.headers()['content-type']).toContain('application/problem+json');
    }
    // And the owner's claim is untouched.
    const mine = await page.request.get(`${API_URL}/api/claims/${claim.id}`, {
      headers: owner.headers,
    });
    const detail = (await mine.json()) as { claim: { status: string }; documents: unknown[] };
    expect(detail.claim.status).toBe('Submitted');
    expect(detail.documents).toHaveLength(1);
  });
});
