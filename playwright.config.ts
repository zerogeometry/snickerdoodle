import { defineConfig, devices } from '@playwright/test';

// E2E_PORT: run several e2e servers side by side (one per test worktree + database) — default 3100.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;

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
    baseURL: BASE,
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
      `cross-env NEXT_DIST_DIR=.next-e2e npm run build && cross-env NEXT_DIST_DIR=.next-e2e S3_KMS_KEY_ALIAS=snickerdoodle-local S3_KMS_KEY_ALIAS_ORIGINALS=snickerdoodle-local APP_URL=${BASE} AUTH_URL=${BASE} MAIL_PROVIDER=console npm run start -- -p ${PORT}`,
    url: BASE,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
