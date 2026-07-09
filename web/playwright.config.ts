/**
 * Playwright config — Phase 0 stub.
 * Phase 3 tester will flesh this out:
 *  - start `npm run preview` on port 4173 as webServer
 *  - default `baseURL: http://localhost:4173`
 *  - projects for chromium / firefox / webkit
 *  - reuse the supabase mock env when secrets aren't available
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  // Phase 3 will add: webServer: { command: 'npm run preview', port: 4173 }
});