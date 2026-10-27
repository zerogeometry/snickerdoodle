import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * e2e config (task #37). Tests the real user journeys against a running app + the dev
 * Postgres/MinIO. Reuses an already-running dev server on :3000 when present, else starts
 * one. Kept serial + un-retried locally; CI can dial these up.
 */
export default defineConfig({
  testDir: './e2e',
  // CI (or E2E_SEED=1): the catalogue + synthetic mockup templates where none exist (e2e/seed.ts).
  // Absolute, so tests/visual/playwright.config.ts (which spreads this config) finds it too.
  globalSetup: fileURLToPath(new URL('./e2e/global-setup.ts', import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // CI also keeps an HTML report (uploaded when a job fails)
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  // Locally: the system Edge (no browser download). CI: Playwright's bundled Chromium.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'msedge' } }],
  // A FRESH production server on its own port — never the dev server (whose .next can be
  // clobbered by a concurrent `next build`). CI builds + starts; locally, reuse a
  // `next build && next start -p 3100` you leave running.
  webServer: {
    // Production refuses unencrypted originals, so the e2e server uses local MinIO's built-in
    // KMS key (docker-compose.yml) — the real encrypted-storage path, not a bypass.
    command:
      // …and its own address (sign-in links come back to :3100, not a dev server's :3000) and the console mailer
      // (production refuses to start without a mail provider; the complaint form insists its acknowledgement is sent).
      'cross-env NEXT_DIST_DIR=.next-e2e npm run build && cross-env NEXT_DIST_DIR=.next-e2e S3_KMS_KEY_ALIAS=snickerdoodle-local S3_KMS_KEY_ALIAS_ORIGINALS=snickerdoodle-local APP_URL=http://localhost:3100 AUTH_URL=http://localhost:3100 MAIL_PROVIDER=console npm run start -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
