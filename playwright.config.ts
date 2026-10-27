import { defineConfig } from '@playwright/test';
import { BASE_URL, desktop, mobile, webServer } from './e2e/config';

/**
 * e2e config (task #37). Tests the real user journeys against a running app + the dev
 * Postgres/MinIO, on a DESKTOP and a ~390px PHONE (touch) — every journey runs on both unless
 * a spec says why not. Kept serial + un-retried locally; CI retries once and keeps the report.
 * Visual regression lives in playwright.visual.config.ts (`npm run test:visual`).
 */
export default defineConfig({
  testDir: './e2e',
  // catalogue + synthetic mockup templates where none exist (e2e/seed.ts)
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'desktop', use: desktop },
    { name: 'mobile', use: mobile },
  ],
  webServer,
});
