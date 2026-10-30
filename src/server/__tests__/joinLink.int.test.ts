import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { invites } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { maskEmail } from '@/lib/maskEmail';
import { resolveViewerContext } from '@/server/assets';
import { createInvite, safeJoinNext, sendInviteSignInLink } from '@/server/invites';
import type { DbHandle } from '@/server/db';

/**
 * 06-B1 (test sweep 2026-10-29): a gift link's "join the family" lands on /join/<token>, and gift
 * links get forwarded — so whoever holds one must never learn the invitee's email address. The page
 * shows it masked; the SERVER sends the one-tap link, only ever to the invited address.
 */
describe('maskEmail', () => {
  it('shows enough to recognise, never the whole address', () => {
    expect(maskEmail('granny@example.com')).toBe('gr•••@example.com');
    expect(maskEmail('Jo@example.com')).toBe('J•••@example.com');
    expect(maskEmail('a@b.co')).toBe('a•••@b.co');
    expect(maskEmail('not-an-email')).toBe('•••');
    expect(maskEmail('@example.com')).toBe('•••');
    for (const e of ['granny@example.com', 'grandad.smith@example.com']) expect(maskEmail(e)).not.toContain(e.split('@')[0]);
  });
});

const URL = process.env.DATABASE_URL;
describe.skipIf(!URL)('06-B1: the /join "email me the link" (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const email = `granny-${randomUUID().slice(0, 8)}@example.test`;
  let token: string;

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    ({ token } = await createInvite(db, sam, { familyId: ids.hartleyId, email, relationship: 'GRANDPARENT', accessLevel: 'VIEW_BUY' }));
  });
  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('sends only to the INVITED address, back to the invite (+ a gift-link next only), and tells the caller nothing else', async () => {
    const sent: Array<[string, string]> = [];
    const res = await sendInviteSignInLink(db, token, '/g/abcdefgh12', async (to, cb) => void sent.push([to, cb]));
    expect(res).toEqual({ ok: true }); // no address in the answer
    expect(sent).toEqual([[email, `/join/${token}?next=${encodeURIComponent('/g/abcdefgh12')}`]]);
    // a next that isn't a gift-link path is dropped
    sent.length = 0;
    await sendInviteSignInLink(db, token, 'https://evil.example/x', async (to, cb) => void sent.push([to, cb]));
    expect(sent).toEqual([[email, `/join/${token}`]]);
  });

  it('a made-up, used, revoked or expired invite sends nothing', async () => {
    const sent: string[] = [];
    const send = async (to: string) => void sent.push(to);
    expect(await sendInviteSignInLink(db, 'not-a-real-token-123', null, send)).toEqual({ ok: false });
    for (const change of [{ status: 'REVOKED' as const }, { status: 'VERIFIED' as const }, { expiresAt: new Date(Date.now() - 1000) }]) {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const inv = await createInvite(db, sam, { familyId: ids.hartleyId, email: `x-${randomUUID().slice(0, 6)}@example.test`, relationship: 'GRANDPARENT', accessLevel: 'VIEW' });
      await db.update(invites).set(change).where(eq(invites.token, inv.token));
      expect(await sendInviteSignInLink(db, inv.token, null, send)).toEqual({ ok: false });
    }
    expect(sent).toEqual([]);
  });

  it('safeJoinNext honours a gift-link path only', () => {
    expect(safeJoinNext('/g/abcdefgh12')).toBe('/g/abcdefgh12');
    expect(safeJoinNext(['/g/abcdefgh12', '/home'])).toBe('/g/abcdefgh12');
    for (const bad of ['/home', '//evil.example', '/\\evil.example', '/g/short', null, undefined]) expect(safeJoinNext(bad)).toBeNull();
  });
});
