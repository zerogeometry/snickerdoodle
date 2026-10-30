import { test as base } from '@playwright/test';
import { hasDb, sql } from './harness';

/**
 * The e2e `test` — Playwright's own, plus one automatic step before EVERY test: the local database's
 * rate-limit counters are emptied. A full run uploads far more than the 60 guest uploads an hour one
 * address may make (src/server/rateLimit.ts), so without this the later specs were throttled into
 * failing. The limits themselves are untouched — each test simply starts with a clean slate, as a
 * fresh visitor would. Only ever against a LOCAL database (localhost / 127.0.0.1 / ::1).
 *
 * Specs import { test, expect } from './test' instead of '@playwright/test'.
 */
export * from '@playwright/test';

const LOCAL_DB = /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(process.env.DATABASE_URL ?? '');

export const test = base.extend<{ freshRateLimits: void }>({
  freshRateLimits: [
    async ({}, use) => {
      if (hasDb && LOCAL_DB) await sql()`delete from rate_limits`;
      await use();
    },
    { auto: true },
  ],
});
