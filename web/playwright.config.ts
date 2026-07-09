/**
 * Playwright config — Phase 3 (tester agent).
 *
 *  - E2E tests run against the production build (`npm run preview` on 4173).
 *  - Single project (chromium) for fast CI; can extend to firefox/webkit later.
 *  - Sequential workers in CI to avoid port conflicts.
 *  - Server is auto-started by Playwright; reuse when developing locally.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !CI,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port ' + PORT + ' --strictPort',
    port: PORT,
    reuseExistingServer: !CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
