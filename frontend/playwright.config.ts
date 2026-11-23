import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the real API (docker compose, :8080) and the
// Vite dev server. Nothing is mocked: these tests create real users.
// E2E_BASE_URL lets the suite run its own dev server on :3000 (the API's
// other allowed origin) while a developer's :5173 server keeps running.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const PORT = new URL(BASE_URL).port || '5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // CI keeps an HTML report and a trace of each failure as job artifacts.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // The signed-in cabinet and the staff desks again at phone width: bottom
    // bar, cards instead of tables, and no horizontal scroll at 390px.
    {
      name: 'mobile',
      testMatch: /(cabinet|staff)-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    // Test-only routes (the crash route for the error boundary). A reused
    // server must have been started with it too.
    env: { VITE_E2E_ROUTES: 'true' },
  },
});
