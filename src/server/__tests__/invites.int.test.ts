import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, invites, memberships } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { listViewableAssets, resolveViewerContext } from '@/server/assets';
import { acceptInvite, createInvite } from '@/server/invites';
import type { DbHandle } from '@/server/db';

/**
 * Invites → verify → join, against a real Postgres. Proves NN3 (parent-initiated
 * only, no self-join), identity verification, single-use, expiry, and that a
 * joiner gains exactly the invited circle. Skipped without DATABASE_URL.
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('invites → join — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const nonce = randomUUID().slice(0, 8);
  const inviteeEmail = `joiner-${nonce}@example.com`;
  let inviteeId = '';

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    const [acct] = await db.insert(accounts).values({ email: inviteeEmail, displayName: 'Joiner' }).returning();
    inviteeId = acct!.id;
  });

  afterAll(async () => {
    if (inviteeId) {
      await db.delete(memberships).where(eq(memberships.accountId, inviteeId));
      await db.delete(accounts).where(inArray(accounts.id, [inviteeId]));
    }
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('only the owner can invite (a non-owner is refused)', async () => {
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // member, not owner
    await expect(
      createInvite(db, rosie, { familyId: ids.hartleyId, email: inviteeEmail, relationship: 'GRANDPARENT', accessLevel: 'VIEW_BUY' }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it('owner invites; wrong account cannot accept; the right account joins at the invited circle', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { token } = await createInvite(db, sam, {
      familyId: ids.hartleyId,
      email: inviteeEmail.toUpperCase(), // server lowercases
      relationship: 'GRANDPARENT',
      accessLevel: 'VIEW_BUY',
    });

    // identity: a different email can't accept
    const wrong = await acceptInvite(db, { id: ids.blakeId, email: `someone-else-${nonce}@example.com` }, token);
    expect(wrong).toMatchObject({ ok: false, reason: 'wrong-account' });

    // the invited person joins
    const ok = await acceptInvite(db, { id: inviteeId, email: inviteeEmail }, token);
    expect(ok.ok).toBe(true);

    const joiner = await resolveViewerContext(db, inviteeId, ids.hartleyId);
    expect(joiner.membership).toMatchObject({ status: 'ACTIVE', circle: 'EXTENDED', accessLevel: 'VIEW_BUY', isOwner: false });

    // …and now sees the family's EXTENDED keepsake (but nothing FAMILY-only)
    const seen = await listViewableAssets(db, ids.hartleyId, joiner);
    expect(seen.map((a) => a.id)).toEqual([ids.assetExtended]);

    // single-use: the invite is spent
    const again = await acceptInvite(db, { id: inviteeId, email: inviteeEmail }, token);
    expect(again).toMatchObject({ ok: false, reason: 'used' });
  });

  it('an expired invite cannot be accepted', async () => {
    const token = `expired-${nonce}`;
    await db.insert(invites).values({
      familyId: ids.hartleyId,
      createdByAccountId: ids.samId,
      email: inviteeEmail,
      relationship: 'CLOSE_FRIEND',
      circle: 'EXTENDED',
      accessLevel: 'VIEW',
      token,
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await acceptInvite(db, { id: inviteeId, email: inviteeEmail }, token);
    expect(res).toMatchObject({ ok: false, reason: 'expired' });
  });
});
