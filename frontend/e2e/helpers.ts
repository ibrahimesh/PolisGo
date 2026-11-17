import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';

export type Theme = 'dark' | 'light';

// Seed preferences before any app script runs, exactly as a returning
// visitor's browser would have them.
export async function usePreferences(page: Page, prefs: { theme?: Theme; lang?: string }) {
  await page.addInitScript((p) => {
    if (p.theme) localStorage.setItem('polisgo.theme', p.theme);
    if (p.lang) localStorage.setItem('polisgo.lang', p.lang);
  }, prefs);
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
  return {
    fullName: `Leyla Məmmədova ${id}`,
    email: `e2e.${id}@polisgo.test`,
    phone: '+994 50 123 45 67',
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
