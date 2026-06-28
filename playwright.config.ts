import { defineConfig, devices } from '@playwright/test';

/**
 * e2e config (task #37). Tests the real user journeys against a running app + the dev
 * Postgres/MinIO. Reuses an already-running dev server on :3000 when present, else starts
 * one. Kept serial + un-retried locally; CI can dial these up.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // A FRESH production server on its own port — never the dev server (whose .next can be
  // clobbered by a concurrent `next build`). CI builds + starts; locally, reuse a
  // `next build && next start -p 3100` you leave running.
  webServer: {
    command: 'cross-env NEXT_DIST_DIR=.next-e2e npm run build && cross-env NEXT_DIST_DIR=.next-e2e npm run start -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
