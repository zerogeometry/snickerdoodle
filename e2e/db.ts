import { createHash, randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';

/**
 * Direct database access for the journeys that cross an inbox or a human step:
 *  - reading what the server wrote (an order's server-side total, a membership's circle/access),
 *  - "opening the email": a magic link is a one-time token the server stores HASHED, so we can't
 *    read it back — instead we mint a known token for the same address exactly as Auth.js stores
 *    it (SHA-256 of token + AUTH_SECRET) and open the real callback URL. Everything after that
 *    click (identity verification, invite acceptance, sessions) is the real code path,
 *  - standing in for the content reviewer (production fails closed: with no screening provider
 *    configured, every upload is held for review — see src/server/moderation).
 *
 * Test addresses use example.com (reserved — never a real inbox). Nothing here touches a
 * deployed database: the e2e seed refuses non-local hosts and so does this.
 */
export const hasDb = Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET);

let client: postgres.Sql | null = null;
export function sql(): postgres.Sql {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(host)) throw new Error(`e2e: refusing a non-local database (${host})`);
  client ??= postgres(process.env.DATABASE_URL, { prepare: false, max: 2, idle_timeout: 5 });
  return client;
}

/** A fresh, never-real address per run so journeys never collide. */
export function testEmail(tag: string): string {
  return `e2e-${tag}-${Date.now().toString(36)}${randomBytes(3).toString('hex')}@example.com`;
}

const hashToken = (raw: string) => createHash('sha256').update(`${raw}${process.env.AUTH_SECRET}`).digest('hex');

/** Open a one-tap sign-in link for `email`, landing on `callbackPath` (the real Auth.js callback). */
export async function openMagicLink(page: Page, email: string, callbackPath: string) {
  const raw = randomBytes(32).toString('hex');
  await sql()`insert into verification_tokens (identifier, token, expires) values (${email.toLowerCase()}, ${hashToken(raw)}, now() + interval '1 hour')`;
  await page.goto(`/api/auth/callback/email?${new URLSearchParams({ callbackUrl: callbackPath, token: raw, email: email.toLowerCase() })}`);
}

/** Sign in (a brand-new account the first time) and land on `next`. */
export async function signIn(page: Page, email: string, next = '/home') {
  await openMagicLink(page, email, next);
  await expect(page).not.toHaveURL(/\/api\/auth|\/login/);
}

/** Did the app actually send a sign-in email to this address? (Auth.js stores its token row.) */
export async function magicLinkWasSent(email: string): Promise<boolean> {
  const rows = await sql()`select 1 from verification_tokens where identifier = ${email.toLowerCase()} limit 1`;
  return rows.length > 0;
}

export async function accountId(email: string): Promise<string> {
  const [row] = await sql()`select id from accounts where email = ${email.toLowerCase()}`;
  if (!row) throw new Error(`no account for ${email}`);
  return row.id as string;
}

/** Give a fresh account a first name the way the app shows it (e.g. "Sam's family"). */
export async function setDisplayName(email: string, name: string) {
  await sql()`update accounts set display_name = ${name} where email = ${email.toLowerCase()}`;
}

/** The reviewer clears this account's uploads (production holds every upload for review). */
export async function reviewerClearsUploadsOf(email: string): Promise<string[]> {
  const rows = await sql()`
    update assets set moderation_status = 'CLEAR', moderated_at = now()
    where uploader_account_id = (select id from accounts where email = ${email.toLowerCase()})
    returning id`;
  return rows.map((r) => r.id as string);
}

export async function keptAssetsOf(email: string) {
  return sql()`
    select a.id, a.visibility, a.kept_in_home, a.moderation_status
    from assets a join accounts ac on ac.id = a.uploader_account_id
    where ac.email = ${email.toLowerCase()} and a.kept_in_home
    order by a.created_at desc`;
}

export async function latestGiftLinkOf(email: string): Promise<{ id: string; token: string; inviteId: string | null }> {
  const [row] = await sql()`
    select g.id, g.token, g.invite_id from gift_links g join accounts a on a.id = g.created_by_account_id
    where a.email = ${email.toLowerCase()} order by g.created_at desc limit 1`;
  if (!row) throw new Error(`no gift link by ${email}`);
  return { id: row.id as string, token: row.token as string, inviteId: (row.invite_id as string | null) ?? null };
}

export async function ordersForGiftLink(giftLinkId: string) {
  return sql()`
    select o.ref, o.status, o.account_id, o.subtotal_pence, o.join_saving_pence, o.total_pence, o.is_gift, o.gift_from_name
    from orders o where o.gift_link_id = ${giftLinkId} order by o.created_at`;
}

export async function membershipOf(email: string, familyIdOfLink: string) {
  const [row] = await sql()`
    select m.circle, m.access_level, m.status, m.is_owner, m.invite_id, i.status as invite_status
    from memberships m join accounts a on a.id = m.account_id left join invites i on i.id = m.invite_id
    where a.email = ${email.toLowerCase()} and m.family_id = ${familyIdOfLink}`;
  return row ?? null;
}

export async function giftLinkFamily(giftLinkId: string): Promise<string> {
  const [row] = await sql()`select family_id from gift_links where id = ${giftLinkId}`;
  return row!.family_id as string;
}
