import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  adminApi,
  API_URL,
  cabinetApi,
  claimsApi,
  FILES,
  isoToday,
  randomUser,
  uniqueVehicle,
  registerSession,
  seedPreferences,
  startCoverEarlier,
  openSession,
  waitForPremium,
} from './helpers';
import type { Theme } from './helpers';

// Regenerates docs/screenshots. Tagged so the regular e2e run skips it:
//   npm run e2e:screenshots

const SIZES = [
  { label: 'desktop', viewport: { width: 1440, height: 900 } },
  { label: 'mobile', viewport: { width: 390, height: 844 } },
] as const;

const SHOTS: { file: string; path: string; theme: Theme }[] = [
  { file: 'landing-dark', path: '/', theme: 'dark' },
  { file: 'landing-light', path: '/', theme: 'light' },
  { file: 'register', path: '/register', theme: 'dark' },
  { file: 'login', path: '/login', theme: 'dark' },
];

async function settle(page: Page, path: string) {
  if (path === '/') {
    await waitForPremium(page);
    await page.locator('#coverage table').waitFor();
  }
  await page.evaluate(() => document.fonts.ready);
  // Let the price tween and toast-free UI come to rest.
  await page.waitForTimeout(400);
}

for (const size of SIZES) {
  test.describe(`${size.label} @screenshots`, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: 2 });

    for (const shot of SHOTS) {
      test(`${shot.file}-${size.label}`, async ({ page }) => {
        // A full-page capture never scrolls, so the scroll reveal would leave
        // lower sections blank; reduced motion shows everything at once.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await seedPreferences(page, { theme: shot.theme, lang: 'en' });
        await page.goto(shot.path);
        await settle(page, shot.path);
        await page.screenshot({
          path: `docs/screenshots/${shot.file}-${size.label}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      });
    }
  });
}

/* ---------- Client cabinet: first screen only ---------- */

const CABINET_PAGES = [
  'overview',
  'policies',
  'policy',
  'buy',
  'claims',
  'claim',
  'claim-new',
  'profile',
] as const;
const THEMES: Theme[] = ['dark', 'light'];

// One client with real data behind every page: an active policy, one that
// ends inside the 30-day reminder window, and an unpaid draft.
async function seedClient(page: Page) {
  const { session } = await registerSession(page, { ...randomUser(), fullName: 'Leyla Məmmədova' });
  const api = cabinetApi(page, session);
  const { policy } = await api.activePolicy(12, 'MTPL');
  await api.activePolicy(1, 'CASCO');
  // Sorts first by plate, so the wizard preselects it; it has only a CASCO
  // draft, so MTPL prices without an overlap.
  const spare = await api.vehicle({
    ...uniqueVehicle(),
    // Random digits: parallel workers run this at the same millisecond.
    plateNumber: `10-AA-${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
  });
  await api.policy(spare.id, 'CASCO', 6);

  // Claims: one decided (a full timeline with the adjuster's note), one open.
  const claims = claimsApi(page, session);
  const decided = await claims.file(policy.id, {
    claimedAmount: 1240,
    description: 'Rear bumper and boot lid dented at a red light; the other driver admitted fault.',
  });
  await claims.upload(decided.id, 'rear-bumper.png', FILES.png);
  await claims.upload(decided.id, 'garage-estimate.pdf', FILES.pdf, 'application/pdf');
  const admin = await adminApi(page);
  await admin.act(decided.id, 'review', { comment: 'Checking the photos against the estimate.' });
  await admin.act(decided.id, 'approve', {
    approvedAmount: 1190,
    comment: 'Approved minus the 50 AZN excess.',
  });
  await claims.file(policy.id, {
    incidentType: 'Glass',
    claimedAmount: 180,
    location: 'Baku–Sumgait highway, km 12',
    description: 'A stone from a truck cracked the windscreen.',
  });
  return { session, policyId: policy.id, claimId: decided.id };
}

for (const size of SIZES) {
  test.describe(`cabinet ${size.label} @screenshots`, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: 2 });

    for (const theme of THEMES) {
      test(`cabinet-${theme}-${size.label}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const { session, policyId, claimId } = await seedClient(page);
        await seedPreferences(page, { theme, lang: 'en' });
        await openSession(page, session);

        const paths: Record<(typeof CABINET_PAGES)[number], string> = {
          overview: '/app',
          policies: '/app/policies',
          policy: `/app/policies/${policyId}`,
          buy: '/app/buy',
          claims: '/app/claims',
          claim: `/app/claims/${claimId}`,
          'claim-new': '/app/claims/new',
          profile: '/app/profile',
        };
        for (const name of CABINET_PAGES) {
          await page.goto(paths[name]);
          if (name === 'overview')
            await page.getByText('Active policies', { exact: true }).waitFor();
          if (name === 'policies') await page.getByText('3 policies', { exact: true }).waitFor();
          if (name === 'policy')
            await page.getByRole('heading', { name: 'Status history' }).waitFor();
          if (name === 'buy') {
            await page.getByRole('radio', { name: /^MTPL/ }).check();
            await page.getByText(/^Your premium: /).waitFor({ state: 'attached', timeout: 15_000 });
          }
          if (name === 'claims') await page.getByText('2 claims', { exact: true }).waitFor();
          if (name === 'claim') await page.getByRole('heading', { name: 'History' }).waitFor();
          if (name === 'claim-new')
            await page.getByRole('heading', { name: 'Which policy is the claim for?' }).waitFor();
          if (name === 'profile') await page.getByLabel('Full name').waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(400);
          await page.screenshot({
            path: `docs/screenshots/cabinet-${name}-${theme}-${size.label}.png`,
            animations: 'disabled',
          });
        }
      });
    }
  });
}

/* ---------- Staff desks: first screen only ---------- */

const PEOPLE = ['Aysel Həsənova', 'Rauf Quliyev', 'Nigar Əliyeva'];

// An adjuster with three claims in their review (one with photos and a PDF)
// and an agent with three customers, each sold a paid policy.
async function seedStaff(page: Page) {
  const admin = await adminApi(page);
  const adjuster = await admin.createStaff('Adjuster', 'Rauf Məmmədli');
  const agent = await admin.createStaff('Agent', 'Leyla Əliyeva');
  const claimIds: string[] = [];
  const customerIds: string[] = [];

  for (const [index, fullName] of PEOPLE.entries()) {
    const { session, user } = await registerSession(page, { ...randomUser(), fullName });
    const customerId = await admin.customerIdFor(user.email);
    await admin.assignAgent(customerId, agent.id);
    customerIds.push(customerId);

    const vehicle = await cabinetApi(page, session).vehicle();
    const sale = await page.request.post(`${API_URL}/api/policies`, {
      headers: { Authorization: `Bearer ${agent.session.token}` },
      data: {
        vehicleId: vehicle.id,
        policyTypeCode: index === 1 ? 'CASCO' : 'MTPL',
        startDate: isoToday(1),
        termMonths: 12,
        customerId,
      },
    });
    const { id: policyId } = (await sale.json()) as { id: string };
    await page.request.post(`${API_URL}/api/policies/${policyId}/pay`, {
      headers: { Authorization: `Bearer ${agent.session.token}` },
    });
    // Sold today, it starts tomorrow: move it back so it can take a claim.
    startCoverEarlier(policyId, 8);

    const claim = await claimsApi(page, session).file(policyId, {
      claimedAmount: [1240, 860, 2150][index],
      incidentType: ['Collision', 'Glass', 'Vandalism'][index],
      location: [
        'Bakı, Nizami küçəsi 10',
        'Bakı–Sumqayıt yolu, 12-ci km',
        'Gəncə, Atatürk prospekti 5',
      ][index],
      description: [
        'Rear bumper and boot lid dented at a red light; the other driver admitted fault.',
        'A stone from a truck cracked the windscreen.',
        'Both mirrors broken while parked overnight.',
      ][index],
    });
    if (index === 0) {
      await claimsApi(page, session).upload(claim.id, 'rear-bumper.png', FILES.png);
      await claimsApi(page, session).upload(
        claim.id,
        'garage-estimate.pdf',
        FILES.pdf,
        'application/pdf',
      );
    }
    await page.request.post(`${API_URL}/api/claims/${claim.id}/review`, {
      headers: { Authorization: `Bearer ${adjuster.session.token}` },
      data: {},
    });
    claimIds.push(claim.id);
  }
  return { adjuster, agent, claimId: claimIds[0] ?? '', customerId: customerIds[0] ?? '' };
}

const STAFF_PAGES = [
  'overview',
  'queue',
  'review',
  'customers',
  'customer',
  'sales',
  'sell',
] as const;

for (const size of SIZES) {
  test.describe(`staff ${size.label} @screenshots`, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: 2 });

    for (const theme of THEMES) {
      test(`staff-${theme}-${size.label}`, async ({ page, browser }) => {
        const { adjuster, agent, claimId, customerId } = await seedStaff(page);
        const contexts = {
          adjuster: await browser.newContext({
            viewport: size.viewport,
            deviceScaleFactor: 2,
            reducedMotion: 'reduce',
          }),
          agent: await browser.newContext({
            viewport: size.viewport,
            deviceScaleFactor: 2,
            reducedMotion: 'reduce',
          }),
        };
        const adjusterPage = await contexts.adjuster.newPage();
        const agentPage = await contexts.agent.newPage();
        for (const [p, session] of [
          [adjusterPage, adjuster.session],
          [agentPage, agent.session],
        ] as const) {
          await seedPreferences(p, { theme, lang: 'en' });
          await openSession(p, session);
        }

        const steps: Record<
          (typeof STAFF_PAGES)[number],
          { page: Page; path: string; ready: (p: Page) => Promise<unknown> }
        > = {
          overview: {
            page: adjusterPage,
            path: '/app',
            ready: (p) => p.getByRole('heading', { name: 'Claims desk' }).waitFor(),
          },
          queue: {
            page: adjusterPage,
            path: '/app/claims?view=mine',
            ready: (p) => p.getByText('3 claims', { exact: true }).waitFor(),
          },
          review: {
            page: adjusterPage,
            path: `/app/claims/${claimId}`,
            ready: async (p) => {
              await p.getByRole('radio', { name: 'Approve' }).check();
              await p.getByRole('textbox', { name: 'Amount to approve' }).fill('1190');
              await p
                .getByRole('textbox', { name: 'Note (optional)' })
                .fill('Approved minus the 50 AZN excess.');
            },
          },
          customers: {
            page: agentPage,
            path: '/app/customers',
            ready: (p) => p.getByText('3 customers', { exact: true }).waitFor(),
          },
          customer: {
            page: agentPage,
            path: `/app/customers/${customerId}`,
            ready: (p) => p.getByRole('heading', { name: 'Policies', exact: true }).waitFor(),
          },
          sales: {
            page: agentPage,
            path: '/app/sales',
            ready: (p) => p.getByText('3 policies', { exact: true }).waitFor(),
          },
          sell: {
            page: agentPage,
            path: `/app/customers/${customerId}/sell`,
            ready: async (p) => {
              await p
                .getByRole('radio', { name: /^Toyota/ })
                .first()
                .check();
              await p.getByRole('radio', { name: /^CASCO/ }).check();
              await p.getByText(/^Your premium: /).waitFor({ state: 'attached', timeout: 15_000 });
            },
          },
        };
        for (const name of STAFF_PAGES) {
          const step = steps[name];
          await step.page.goto(step.path);
          await step.ready(step.page);
          await step.page.evaluate(() => document.fonts.ready);
          await step.page.waitForTimeout(400);
          await step.page.screenshot({
            path: `docs/screenshots/staff-${name}-${theme}-${size.label}.png`,
            animations: 'disabled',
          });
        }
        await contexts.adjuster.close();
        await contexts.agent.close();
      });
    }
  });
}

/* ---------- Admin panel: first screen only, on the demo data ---------- */

const ADMIN_PAGES = ['dashboard', 'staff', 'customers', 'policies', 'audit', 'products'] as const;

for (const size of SIZES) {
  test.describe(`admin ${size.label} @screenshots`, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: 2 });

    for (const theme of THEMES) {
      test(`admin-${theme}-${size.label}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const admin = await (await adminApi(page)).createStaff('Admin', 'Nərmin Əhmədova');
        await seedPreferences(page, { theme, lang: 'en' });
        await openSession(page, admin.session);

        const steps: Record<
          (typeof ADMIN_PAGES)[number],
          { path: string; ready: () => Promise<unknown> }
        > = {
          dashboard: {
            path: '/app?range=12m',
            ready: () => page.getByRole('heading', { name: 'Top agents by premium' }).waitFor(),
          },
          staff: {
            path: '/app/admin/staff?q=demo.polisgo.az',
            ready: () => page.getByText('4 accounts', { exact: true }).waitFor(),
          },
          customers: {
            path: '/app/customers?q=demo.polisgo.az&sort=nameAsc',
            ready: () => page.getByText('8 customers', { exact: true }).waitFor(),
          },
          policies: {
            path: '/app/admin/policies?q=DEMO',
            ready: () => page.getByText(/^\d+ policies$/).waitFor(),
          },
          audit: {
            path: '/app/admin/audit?type=Claim',
            ready: () => page.getByText(/^\d+ events$/).waitFor(),
          },
          products: {
            path: '/app/admin/policy-types',
            ready: () => page.getByText(/rates are illustrative/).waitFor(),
          },
        };
        for (const name of ADMIN_PAGES) {
          await page.goto(steps[name].path);
          await steps[name].ready();
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(400);
          await page.screenshot({
            path: `docs/screenshots/admin-${name}-${theme}-${size.label}.png`,
            animations: 'disabled',
          });
        }
      });
    }
  });
}
