import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';

export type Theme = 'dark' | 'light';

// Seed preferences before any app script runs, exactly as a returning
// visitor's browser would have them. Only when unset, so a change the test
// makes in the app survives the next reload; `override` replaces an earlier
// seed (e.g. a describe-level default) instead.
export async function seedPreferences(
  page: Page,
  prefs: { theme?: Theme; lang?: string },
  { override = false }: { override?: boolean } = {},
) {
  await page.addInitScript(
    ([p, force]) => {
      const seed = (key: string, value: string | undefined) => {
        if (value && (force || !localStorage.getItem(key))) localStorage.setItem(key, value);
      };
      seed('polisgo.theme', p.theme);
      seed('polisgo.lang', p.lang);
    },
    [prefs, override] as const,
  );
}

// Language, theme and motion live in the Settings dialog (no header
// switchers). Public pages open it from the footer; choices are visually
// hidden radios inside labels, clicked like a user would. Escape closes it.
export async function chooseSetting(page: Page, name: string) {
  await page
    .getByRole('contentinfo')
    .getByRole('button', { name: /^(Settings|Настройки|Ayarlar)$/ })
    .click();
  const dialog = page.getByRole('dialog', { name: /^(Settings|Настройки|Ayarlar)$/ });
  await expect(dialog).toBeVisible();
  const radio = dialog.getByRole('radio', { name, exact: true });
  await radio.locator('xpath=..').click();
  await expect(radio).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

// axe (WCAG 2.2 AA) on the current page; serious and critical findings fail.
export async function expectNoAxeViolations(page: Page) {
  // axe reads computed colours, so a row caught mid-fade (opacity 0.2 of the
  // text over the page) fails contrast although the settled page passes.
  await waitForSettled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
    }));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

export function premiumText(page: Page) {
  return page.getByText(/^Indicative premium: [\d.,\s]+ AZN$/);
}

export async function waitForPremium(page: Page): Promise<string> {
  const locator = premiumText(page);
  await expect(locator).toBeAttached({ timeout: 15_000 });
  return (await locator.textContent()) ?? '';
}

export interface TestUser {
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  drivingLicenseDate: string;
  password: string;
}

export function randomUser(): TestUser {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  // Names must be letters only (client and server validation), so spell the
  // unique id with letters: digits 0-9 become a-j.
  const letters = id.replace(/\d/g, (d) => String.fromCharCode(97 + Number(d)));
  return {
    fullName: `Leyla Məmmədova ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`,
    email: `e2e.${id}@polisgo.test`,
    phone: '+994501234567',
    birthDate: '1992-03-14',
    drivingLicenseDate: '2012-07-01',
    password: `Passw0rd${id}`,
  };
}

// Creates a user straight through the API, for tests that need one to exist
// but aren't about the register screen.
export async function registerViaApi(page: Page, user: TestUser) {
  const response = await page.request.post(`${API_URL}/api/auth/register`, { data: user });
  expect(response.status(), await response.text()).toBe(200);
}

// Typed view of a captured quote request body.
export function quoteBody(request: { postDataJSON: () => unknown }): Record<string, unknown> {
  const body = request.postDataJSON();
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

/* ---------- Client cabinet ---------- */

export interface Session {
  token: string;
  expiresAt: string;
}

// Registers through the API and returns the session it issued.
export async function registerSession(page: Page, user: TestUser = randomUser()) {
  const response = await page.request.post(`${API_URL}/api/auth/register`, { data: user });
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as Session;
  return { user, session: { token: body.token, expiresAt: body.expiresAt } };
}

// Starts the tab already signed in, exactly as a reload after sign-in would
// (tokenStore rehydrates from sessionStorage). Login itself has its own test.
export async function openSession(page: Page, session: Session) {
  await page.addInitScript((s) => {
    sessionStorage.setItem('polisgo.session', JSON.stringify(s));
  }, session);
}

const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

export function uniqueVehicle() {
  const rnd = (n: number, chars = VIN_CHARS) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return {
    make: 'Toyota',
    model: 'Corolla',
    year: 2019,
    engineCapacityCc: 1800,
    plateNumber: `77-${rnd(2, 'ABCDEFGHJKLMNPRSTUVWXYZ')}-${rnd(5, '0123456789')}`,
    vin: rnd(17),
  };
}

// The business date in Baku, as the API and the SPA count it (UTC+4).
export function isoToday(offsetDays = 0): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Baku',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

// Cover sold through the API starts tomorrow at the earliest, so a claim
// needs cover that began earlier. This moves a paid policy's dates back in
// the database (sqlcmd in the compose stack's sqlserver container, with the
// password the container already has), like TestData does for the backend
// tests. Run from the repo root so docker compose finds the stack (CI sets
// COMPOSE_FILE; a renamed local project needs COMPOSE_PROJECT_NAME).
export function startCoverEarlier(policyId: string, days: number) {
  if (!/^[0-9a-f-]{36}$/i.test(policyId) || !Number.isInteger(days))
    throw new Error('bad arguments');
  const sql = `UPDATE Policies SET StartDate = DATEADD(day, -${days}, StartDate), EndDate = DATEADD(day, -${days}, EndDate) WHERE Id = '${policyId}'`;
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      '-e',
      `SQL=${sql}`,
      'sqlserver',
      'bash',
      '-c',
      '/opt/mssql-tools18/bin/sqlcmd -C -b -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d PolisGo -Q "$SQL"',
    ],
    { cwd: resolve(process.cwd(), '..'), stdio: 'pipe' },
  );
}

// What a DateField shows for an ISO date: DD.MM.YYYY in every language.
export function displayDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

// Thin API client for arranging data a test is not about.
export function cabinetApi(page: Page, session: Session) {
  const headers = { Authorization: `Bearer ${session.token}` };
  async function call<T>(method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
    const response = await page.request.fetch(`${API_URL}${path}`, { method, headers, data });
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return {
    vehicle: (vehicle = uniqueVehicle()) =>
      call<{ id: string; plateNumber: string }>('POST', '/api/vehicles', vehicle),
    policy: (
      vehicleId: string,
      policyTypeCode = 'MTPL',
      termMonths = 12,
      startDate = isoToday(1),
    ) =>
      call<{ id: string; policyNumber: string; startDate: string; endDate: string }>(
        'POST',
        '/api/policies',
        {
          vehicleId,
          policyTypeCode,
          startDate,
          termMonths,
        },
      ),
    pay: (policyId: string) => call('POST', `/api/policies/${policyId}/pay`),
    // A paid policy whose cover began `startedDaysAgo` days ago (0: today),
    // so it can take a claim; a 1-month term still ends within the 30-day
    // reminder window.
    async activePolicy(termMonths = 12, policyTypeCode = 'MTPL', startedDaysAgo = 7) {
      const vehicle = await this.vehicle();
      const policy = await this.policy(vehicle.id, policyTypeCode, termMonths);
      await this.pay(policy.id);
      // Bought today, it starts tomorrow: one more day back.
      const days = startedDaysAgo + 1;
      startCoverEarlier(policy.id, days);
      const shift = (iso: string) => {
        const date = new Date(`${iso}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - days);
        return date.toISOString().slice(0, 10);
      };
      return {
        vehicle,
        policy: { ...policy, startDate: shift(policy.startDate), endDate: shift(policy.endDate) },
      };
    },
  };
}

// The page must never scroll sideways (390px phones included).
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'horizontal overflow').toBeLessThanOrEqual(clientWidth);
}

/* ---------- Claims ---------- */

// A real 1×1 PNG and the first bytes of real JPEG/PDF/EXE files: the API
// checks the bytes, not only the name.
export const FILES = {
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  pdf: Buffer.from('%PDF-1.4\n%e2e\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  exe: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
  gif: Buffer.from('GIF89a'),
};

export function claimBody(policyId: string, patch: Record<string, unknown> = {}) {
  return {
    policyId,
    incidentDate: isoToday(),
    incidentType: 'Collision',
    location: 'Baku, Nizami street 10',
    description: 'Hit from behind while waiting at a red light.',
    // Random so two claims on one policy never trip the duplicate check.
    claimedAmount: 500 + Math.floor(Math.random() * 400),
    ...patch,
  };
}

export function claimsApi(page: Page, session: Session) {
  const headers = { Authorization: `Bearer ${session.token}` };
  return {
    async file(policyId: string, patch: Record<string, unknown> = {}) {
      const response = await page.request.post(`${API_URL}/api/claims`, {
        headers,
        data: claimBody(policyId, patch),
      });
      expect(response.status(), await response.text()).toBe(201);
      return (await response.json()) as { id: string; claimNumber: string };
    },
    async upload(claimId: string, name: string, buffer: Buffer, mimeType = 'image/png') {
      const response = await page.request.post(`${API_URL}/api/claims/${claimId}/documents`, {
        headers,
        multipart: { file: { name, mimeType, buffer } },
      });
      expect(response.status(), await response.text()).toBe(201);
      return (await response.json()) as { id: string; fileName: string };
    },
  };
}

// The dev seed admin (ASPNETCORE_ENVIRONMENT=Development), acting as an
// adjuster. CI passes E2E_ADMIN_*; locally they come from the repo's .env.
function adminCredentials() {
  let email = process.env.E2E_ADMIN_EMAIL;
  let password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    const env = Object.fromEntries(
      readFileSync(resolve(process.cwd(), '../.env'), 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.includes('=') && !line.startsWith('#'))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    email ??= env.SEED_ADMIN_EMAIL;
    password ??= env.SEED_ADMIN_PASSWORD;
  }
  if (!email || !password) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.');
  return { email, password };
}

export async function adminApi(page: Page) {
  const login = await page.request.post(`${API_URL}/api/auth/login`, { data: adminCredentials() });
  expect(login.status(), await login.text()).toBe(200);
  const { token } = (await login.json()) as Session;
  const headers = { Authorization: `Bearer ${token}` };
  const post = async (path: string, data: unknown) =>
    page.request.post(`${API_URL}${path}`, { headers, data });
  return {
    post,
    headers,
    async act(claimId: string, action: 'review' | 'approve' | 'reject', data: unknown = {}) {
      const response = await post(`/api/claims/${claimId}/${action}`, data);
      expect(response.status(), await response.text()).toBe(200);
    },
    // A staff account through POST /api/users/staff, signed in.
    async createStaff(role: StaffRole, fullName = staffName(role)) {
      const user = randomUser();
      const created = await post('/api/users/staff', {
        email: user.email,
        password: user.password,
        fullName,
        role,
      });
      expect(created.status(), await created.text()).toBe(201);
      const { id } = (await created.json()) as { id: string };
      const login = await page.request.post(`${API_URL}/api/auth/login`, {
        data: { email: user.email, password: user.password },
      });
      expect(login.status(), await login.text()).toBe(200);
      const body = (await login.json()) as Session;
      return {
        id,
        fullName,
        email: user.email,
        password: user.password,
        session: { token: body.token, expiresAt: body.expiresAt },
      };
    },
    // The customer record behind a registered client (the directory finds
    // them by email; an admin sees everyone).
    async customerIdFor(email: string) {
      const response = await page.request.get(`${API_URL}/api/customers`, {
        headers,
        params: { search: email },
      });
      expect(response.status(), await response.text()).toBe(200);
      const { items } = (await response.json()) as { items: { id: string }[] };
      expect(items).toHaveLength(1);
      return items[0]?.id ?? '';
    },
    // A staff account's id by its email (e.g. the demo agent).
    async staffId(email: string) {
      const response = await page.request.get(`${API_URL}/api/users/staff`, {
        headers,
        params: { search: email },
      });
      expect(response.status(), await response.text()).toBe(200);
      const { items } = (await response.json()) as { items: { id: string }[] };
      expect(items, `no staff account ${email}`).toHaveLength(1);
      return items[0]?.id ?? '';
    },
    async assignAgent(customerId: string, agentId: string | null) {
      const response = await page.request.put(`${API_URL}/api/customers/${customerId}/agent`, {
        headers,
        data: { agentId },
      });
      expect(response.status(), await response.text()).toBe(204);
    },
  };
}

/* ---------- Staff ---------- */

export type StaffRole = 'Agent' | 'Adjuster' | 'Admin';

// Letters only (the API's name rule), unique enough to search for.
function staffName(role: StaffRole) {
  const id = Math.random()
    .toString(36)
    .slice(2, 8)
    .replace(/\d/g, (d) => 'abcdefghij'.charAt(Number(d)));
  const first = { Agent: 'Leyla Agent', Adjuster: 'Rauf Adjuster', Admin: 'Nərmin Admin' }[role];
  return `${first} ${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}

// A client with an active policy and a Submitted claim (the claim's location
// can be set, e.g. to a formula for the export test).
export async function clientWithClaim(page: Page, claimPatch: Record<string, unknown> = {}) {
  const { session, user } = await registerSession(page);
  const { policy, vehicle } = await cabinetApi(page, session).activePolicy();
  const claim = await claimsApi(page, session).file(policy.id, claimPatch);
  return { session, user, policy, vehicle, claim };
}

// Staff API calls with a staff session, returning the raw response so tests
// can assert on the status.
export function staffApi(page: Page, session: Session) {
  const headers = { Authorization: `Bearer ${session.token}` };
  return {
    headers,
    get: (path: string) => page.request.get(`${API_URL}${path}`, { headers }),
    post: (path: string, data: unknown = {}) =>
      page.request.post(`${API_URL}${path}`, { headers, data }),
    async claim(claimId: string) {
      const response = await page.request.get(`${API_URL}/api/claims/${claimId}`, { headers });
      expect(response.status(), await response.text()).toBe(200);
      return (await response.json()) as {
        claim: { status: string; rowVersion: string; claimedAmount: number };
      };
    },
  };
}

// The page has stopped changing: fonts are loaded, no skeleton or busy region
// is left (the app's own signal that a query is in flight), no view transition
// runs, and no finite animation (staggered rows, a dialog's spring) is
// running. An endless skeleton shimmer doesn't count. The checks must hold on
// several frames in a row: data that arrives while a dialog is opening only
// starts its fade-in a frame after the skeleton goes, and a single quiet
// frame would let axe scan the row at opacity 0.2. Fails with what is still
// moving instead of hanging until the test times out.
export async function waitForSettled(page: Page, { timeout = 15_000 } = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    ([calmFrames, limit]) =>
      new Promise<void>((resolve, reject) => {
        const started = performance.now();
        let calm = 0;
        const blockers = () => {
          const found: string[] = [];
          const loading = document.querySelector('.skeleton, [aria-busy="true"]:not(button)');
          if (loading) found.push(`loading: ${loading.tagName.toLowerCase()}.${loading.className}`);
          if (document.documentElement.dataset.vt) found.push('view transition');
          for (const a of document.getAnimations()) {
            if (
              (a.pending || a.playState === 'running') &&
              a.effect?.getComputedTiming().iterations !== Infinity
            ) {
              const name = a instanceof CSSAnimation ? a.animationName : 'transition';
              found.push(`animation: ${name}`);
            }
          }
          return found;
        };
        const tick = () => {
          const found = blockers();
          calm = found.length === 0 ? calm + 1 : 0;
          if (calm >= calmFrames) {
            resolve();
            return;
          }
          if (performance.now() - started > limit) {
            reject(new Error(`page did not settle: ${found.join('; ')}`));
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [3, timeout] as const,
  );
}
