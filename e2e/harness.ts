import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';

/**
 * Test-only reach into the local database, for the journeys that need a signed-in person — the
 * gift loop, the family home. Nothing here exists in the app: the e2e process talks to the same
 * Postgres the server uses (DATABASE_URL, AUTH_SECRET from .env or the environment) and then drives
 * the REAL pages. Never pointed at anything but a local/test database.
 */
function loadEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2').replace(/\s+#.*$/, '');
  }
}
loadEnv();

export const hasDb = Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET);
let _sql: ReturnType<typeof postgres> | null = null;
export const sql = () => (_sql ??= postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 }));

/** A throwaway address, unique per run. */
export const testEmail = (who: string) => `e2e-${who}-${Date.now().toString(36)}${randomBytes(2).toString('hex')}@example.test`;

/**
 * Sign in the way a person does — the one-tap email link — minus the inbox: a link is minted exactly
 * as Auth.js mints one (sha256(token + AUTH_SECRET) stored as a verification token) and opened in the
 * page, so the real callback verifies it, creates the account if new and starts a session.
 */
export async function signInByEmailLink(page: Page, email: string, callbackPath: string) {
  const token = randomBytes(32).toString('hex');
  const hashed = createHash('sha256').update(`${token}${process.env.AUTH_SECRET}`).digest('hex');
  await sql()`insert into verification_tokens (identifier, token, expires) values (${email}, ${hashed}, ${new Date(Date.now() + 10 * 60_000)})`;
  const qs = new URLSearchParams({ callbackUrl: callbackPath, token, email });
  await page.goto(`/api/auth/callback/email?${qs}`);
  await expect.poll(async () => (await page.context().cookies()).some((c) => /authjs\.session-token/.test(c.name))).toBe(true);
}

/**
 * The e2e server screens uploads the way production does without real screening configured: every
 * drawing is HELD for a person to review (CLAUDE.md content safety). A gift link only ever carries
 * cleared art, so the test stands in for that reviewer — for its own test drawing only.
 */
export async function clearForTest(uploaderEmail: string) {
  await sql()`update assets set moderation_status = 'CLEAR'
    where uploader_account_id = (select id from accounts where email = ${uploaderEmail.toLowerCase()})`;
}
