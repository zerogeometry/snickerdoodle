import { existsSync } from 'node:fs';
import { devices, type PlaywrightTestConfig } from '@playwright/test';

// The journeys that read the DB (magic links, gift links, kept keepsakes) need the same
// DATABASE_URL / S3_* / AUTH_SECRET the server reads — pick them up from .env like Next does.
// Already-set variables win (CI sets them on the job).
for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f);

/**
 * Shared Playwright settings for the e2e journeys (playwright.config.ts) and the visual
 * regression suite (playwright.visual.config.ts) — one server recipe, one browser recipe,
 * one phone, so the two suites can never drift apart.
 *
 * Env knobs (all optional; none can weaken a production rule — they only pick a port/browser):
 *   E2E_PORT          the e2e server's port (default 3100)
 *   PW_CHANNEL        a system browser channel locally (default 'msedge'; '' = Playwright's Chromium)
 *   PW_CHROMIUM_PATH  an explicit Chromium binary (e.g. a pre-installed one in a container)
 *   CI                Playwright's bundled Chromium, retries on
 */
export const PORT = Number(process.env.E2E_PORT || 3100);
export const BASE_URL = `http://localhost:${PORT}`;

const channel = process.env.CI || process.env.PW_CHROMIUM_PATH ? undefined : (process.env.PW_CHANNEL ?? 'msedge') || undefined;

/** The browser every project runs in: Chromium (pen + touch pointer input needs CDP). */
export const chromium = {
  browserName: 'chromium' as const,
  channel,
  launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
};

export const desktop = { ...devices['Desktop Chrome'], ...chromium };

/** A ~390×844 iPhone-class phone: touch, mobile viewport, iOS user agent — in Chromium. */
export const mobile = {
  ...devices['iPhone 13'],
  ...chromium,
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/**
 * A FRESH production server on its own port — never the dev server (whose .next can be
 * clobbered by a concurrent `next build`). CI builds + starts; locally, reuse a
 * `next build && next start -p <port>` you leave running.
 *
 * Production refuses unencrypted originals, so the server uses local MinIO's built-in KMS key
 * (docker-compose.yml) — the real encrypted-storage path, not a bypass.
 */
export const webServer: PlaywrightTestConfig['webServer'] = {
  command:
    'cross-env NEXT_DIST_DIR=.next-e2e npm run build && ' +
    `cross-env NEXT_DIST_DIR=.next-e2e S3_KMS_KEY_ALIAS=snickerdoodle-local S3_KMS_KEY_ALIAS_ORIGINALS=snickerdoodle-local npm run start -- -p ${PORT}`,
  url: BASE_URL,
  reuseExistingServer: true,
  timeout: 300_000,
  // Magic links + invite emails point at the server under test.
  env: { APP_URL: BASE_URL },
};
