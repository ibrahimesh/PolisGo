import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the real API (docker compose, :8080) and the
// Vite dev server. Nothing is mocked: these tests create real users.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // CI keeps an HTML report and a trace of each failure as job artifacts.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // The signed-in cabinet again at phone width: bottom bar, sheet-style
    // panels, and no horizontal scroll at 390px.
    {
      name: 'mobile',
      testMatch: /cabinet-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
