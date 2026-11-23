import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { API_URL, openSession, seedPreferences } from './helpers';

// Audit sweep: horizontal overflow on every signed-in route, per role, at
// tablet and phone widths, in the two longest languages.
const DEMO = process.env.DEMO_PASSWORD ?? '' // set DEMO_PASSWORD to the stack's demo password;
const accounts = {
  Client: { email: 'demo.aysel@demo.polisgo.az', password: DEMO },
  Agent: { email: 'demo.agent1@demo.polisgo.az', password: DEMO },
  Adjuster: { email: 'demo.adjuster1@demo.polisgo.az', password: DEMO },
  Admin: { email: process.env.E2E_ADMIN_EMAIL ?? '', password: process.env.E2E_ADMIN_PASSWORD ?? '' },
} as const;

async function signIn(page: Page, role: keyof typeof accounts) {
  const response = await page.request.post(`${API_URL}/api/auth/login`, { data: accounts[role] });
  expect(response.status(), `${role} login`).toBe(200);
  const session = (await response.json()) as { token: string; expiresAt: string };
  const get = async (path: string) =>
    (await (await page.request.get(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${session.token}` } })).json()) as {
      items: { id: string }[];
    };
  return { session, get };
}

async function routesFor(role: keyof typeof accounts, get: (p: string) => Promise<{ items: { id: string }[] }>) {
  const firstClaim = (await get('/api/claims?pageSize=1')).items[0]?.id;
  switch (role) {
    case 'Client': {
      const policy = (await get('/api/policies?pageSize=1')).items[0]?.id;
      return ['/app', '/app/policies', `/app/policies/${policy}`, '/app/buy', '/app/claims', `/app/claims/${firstClaim}`, '/app/claims/new', '/app/profile', '/app/help'];
    }
    case 'Agent': {
      const customer = (await get('/api/customers?pageSize=1')).items[0]?.id;
      return ['/app', '/app/customers', `/app/customers/${customer}`, `/app/customers/${customer}/sell`, '/app/sales', '/app/claims', '/app/help'];
    }
    case 'Adjuster':
      return ['/app', '/app/claims', `/app/claims/${firstClaim}`, '/app/customers', '/app/help'];
    case 'Admin': {
      const customer = (await get('/api/customers?pageSize=1')).items[0]?.id;
      return ['/app', '/app/claims', `/app/claims/${firstClaim}`, '/app/customers', `/app/customers/${customer}`, '/app/admin/policies', '/app/admin/staff', '/app/admin/audit', '/app/admin/policy-types'];
    }
  }
}

for (const width of [390, 768]) {
  for (const lang of ['ru', 'az']) {
    test(`public pages at ${width}px in ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedPreferences(page, { lang, theme: 'dark' }, { override: true });
      for (const route of ['/', '/login', '/register']) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await checkOverflow(page, `${width}-${lang}${route.replace(/\//g, '_') || '_root'}`, route);
      }
    });
    for (const role of ['Client', 'Agent', 'Adjuster', 'Admin'] as const) {
      test(`${role} routes at ${width}px in ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const { session, get } = await signIn(page, role);
        await seedPreferences(page, { lang, theme: 'dark' }, { override: true });
        await openSession(page, session);
        for (const route of await routesFor(role, get)) {
          await page.goto(route);
          await page.waitForLoadState('networkidle');
          await checkOverflow(page, `${width}-${lang}-${role}${route.replace(/\//g, '_')}`.slice(0, 80), route);
        }
      });
    }
  }
}

async function checkOverflow(page: Page, name: string, route: string) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    // The widest element that sticks out past the viewport, for the report.
    let widest = '';
    let right = doc.clientWidth;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.right > right + 1 && getComputedStyle(el).position !== 'fixed') {
        right = r.right;
        widest = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest };
  });
  if (m.scrollWidth > m.clientWidth) {
    await page.screenshot({ path: `test-results/audit-layout/${name}.png`, fullPage: false });
  }
  expect.soft(m.scrollWidth, `${route}: page ${m.scrollWidth}px > ${m.clientWidth}px; widest ${m.widest}`).toBeLessThanOrEqual(m.clientWidth);
}
