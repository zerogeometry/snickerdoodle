import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * The website's buttons for Snickerdoodle Draw's sync choices, as the signed-in grown-up presses them:
 * "connect" needs a keepsakes choice (never a default), the account page changes only this account's
 * own phones, "remove everything draw sent" needs its confirm, and a little one can never be invited
 * (G10). Real Postgres; the session is mocked.
 */
const actor = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string | null } }));
vi.mock('@/server/session', async (orig) => ({ ...(await orig<typeof import('@/server/session')>()), getCurrentAccount: async () => actor.current }));
vi.mock('@/auth', () => ({ auth: async () => null, signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '203.0.113.79' }),
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn(), getAll: () => [] }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
const mail = vi.hoisted(() => ({ sent: [] as unknown[] }));
vi.mock('@/server/mail', async (orig) => ({ ...(await orig<typeof import('@/server/mail')>()), sendMail: vi.fn(async (m: unknown) => void mail.sent.push(m)) }));
vi.mock('@/server/rateLimit', async (orig) => ({ ...(await orig<typeof import('@/server/rateLimit')>()), rateLimit: vi.fn(async () => ({ ok: true, retryAfterSec: 0 })) }));

import { appAuthCodes, appTokens, invites } from '@/db/schema';
import { getDb } from '@/db/client';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { approveAppLinkAction, removeEverythingDrawSentAction, updateAppSyncAction } from '@/app/actions/appLink';
import { createInviteAction } from '@/app/actions/invite';
import { s256 } from '@/server/app/secrets';

const DB = process.env.DATABASE_URL;
const VERIFIER = 'v'.repeat(48);
const params = { response_type: 'code', client_id: 'snickerdoodle-draw', code_challenge: s256(VERIFIER), code_challenge_method: 'S256', state: 'st', redirect_uri: 'https://snickerdoodle.co.uk/app/callback' };

describe.skipIf(!DB)('Snickerdoodle Draw sync — the website’s buttons (integration)', () => {
  const db = getDb() as unknown as import('@/server/db').DbHandle;
  let ids: SeededIds;
  beforeAll(async () => {
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    if (ids) {
      await db.delete(appTokens).where(inArray(appTokens.accountId, [ids.samId, ids.joId]));
      await db.delete(appAuthCodes).where(inArray(appAuthCodes.accountId, [ids.samId, ids.joId]));
      await cleanupDemoFamilies(db, ids);
    }
  });
  const as = (id: string) => (actor.current = { id, email: `${id.slice(0, 6)}@example.test`, name: 'Sam' });

  it('connect is refused until a keepsakes option is chosen — and with one, the code carries every choice', async () => {
    as(ids.samId);
    const before = (await db.select().from(appAuthCodes).where(eq(appAuthCodes.accountId, ids.samId))).length;
    expect(await approveAppLinkAction({ params, familyId: ids.hartleyId, childIds: null, sync: undefined })).toEqual({ ok: false, reason: 'sync' });
    expect(await approveAppLinkAction({ params, familyId: ids.hartleyId, childIds: null, sync: { keepsakes: null, children: true } })).toEqual({ ok: false, reason: 'sync' });
    expect(await approveAppLinkAction({ params, familyId: ids.hartleyId, childIds: null, sync: { keepsakes: 'lots' } })).toEqual({ ok: false, reason: 'sync' });
    expect((await db.select().from(appAuthCodes).where(eq(appAuthCodes.accountId, ids.samId))).length).toBe(before); // nothing minted
    const ok = await approveAppLinkAction({ params, familyId: ids.hartleyId, childIds: null, sync: { keepsakes: 'proud', children: false, progress: 'yes', birthdays: true } });
    expect(ok.ok).toBe(true);
    const [code] = await db.select().from(appAuthCodes).where(eq(appAuthCodes.accountId, ids.samId));
    expect(code).toMatchObject({ syncKeepsakes: 'proud', syncChildren: false, syncProgress: false, syncBirthdays: true });
  });

  it('the account page changes only this account’s own phones', async () => {
    const [tok] = await db.insert(appTokens).values({ tokenHash: `t-${Date.now()}`, accountId: ids.samId, familyId: ids.hartleyId, deviceLabel: 'a phone or tablet' }).returning();
    as(ids.joId);
    expect(await updateAppSyncAction({ tokenId: tok!.id, patch: { keepsakes: 'all' } })).toEqual({ ok: false });
    as(ids.samId);
    expect(await updateAppSyncAction({ tokenId: 'nope', patch: { keepsakes: 'all' } })).toEqual({ ok: false });
    expect(await updateAppSyncAction({ tokenId: tok!.id, patch: { keepsakes: 'all', birthdays: true } })).toEqual({ ok: true, sync: { keepsakes: 'all', children: false, progress: false, birthdays: true } });
    actor.current = null;
    expect(await updateAppSyncAction({ tokenId: tok!.id, patch: { keepsakes: 'none' } })).toEqual({ ok: false });
  });

  it('"remove everything draw sent" needs its confirm and a signed-in grown-up', async () => {
    actor.current = null;
    expect(await removeEverythingDrawSentAction({ confirm: 'remove-everything' })).toEqual({ ok: false });
    as(ids.samId);
    expect(await removeEverythingDrawSentAction({ confirm: 'yes' })).toEqual({ ok: false });
    expect(await removeEverythingDrawSentAction({ confirm: 'remove-everything' })).toMatchObject({ ok: true });
  });

  it('a little one can never be invited (G10): refused before anything is stored or sent', async () => {
    as(ids.samId);
    mail.sent.length = 0;
    const email = `little-${Date.now()}@example.test`;
    expect(await createInviteAction({ email, relationship: 'CHILD', accessLevel: 'VIEW', name: 'Olivia' })).toEqual({ ok: false, reason: 'child' });
    expect(await db.select().from(invites).where(and(eq(invites.email, email), eq(invites.familyId, ids.hartleyId)))).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });
});
