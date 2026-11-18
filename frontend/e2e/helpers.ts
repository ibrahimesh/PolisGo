import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';

export type Theme = 'dark' | 'light';

// Seed preferences before any app script runs, exactly as a returning
// visitor's browser would have them. Only when unset, so a change the test
// makes in the app survives the next reload; `override` replaces an earlier
// seed (e.g. a describe-level default) instead.
export async function usePreferences(
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

// Segmented controls are visually hidden radios inside labels; click the
// label like a user would.
export async function chooseSegment(page: Page, name: string) {
  const radio = page.getByRole('radio', { name, exact: true });
  await radio.locator('xpath=..').click();
  await expect(radio).toBeChecked();
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
export async function useSession(page: Page, session: Session) {
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

export function isoToday(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
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
    policy: (vehicleId: string, policyTypeCode = 'MTPL', termMonths = 12, startDate = isoToday()) =>
      call<{ id: string; policyNumber: string; endDate: string }>('POST', '/api/policies', {
        vehicleId,
        policyTypeCode,
        startDate,
        termMonths,
      }),
    pay: (policyId: string) => call('POST', `/api/policies/${policyId}/pay`),
    // A paid policy; a 1-month term ends within the 30-day reminder window.
    async activePolicy(termMonths = 12, policyTypeCode = 'MTPL') {
      const vehicle = await this.vehicle();
      const policy = await this.policy(vehicle.id, policyTypeCode, termMonths);
      await this.pay(policy.id);
      return { vehicle, policy };
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
