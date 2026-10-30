import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { collectAccountData } from '@/server/exportData';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/** Download-your-data covers every category we hold, and ONLY the requester's own record. */
describe.skipIf(!DB)('collectAccountData — subject-access export', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('has every category, for the owner', async () => {
    const d = await collectAccountData(db, ids.samId);
    for (const key of ['account', 'familyMemberships', 'littleOnes', 'invitesSent', 'giftLists', 'keepsakesYouControl', 'savedForLater', 'orders', 'consents', 'credits', 'referralCodes', 'birthdayNudgesSent', 'yourRequestsToUs', 'yourHelpMessages']) {
      expect(d).toHaveProperty(key);
    }
    expect(d.account?.id).toBe(ids.samId);
    expect(d.littleOnes.map((c) => c.id).sort()).toEqual([ids.oliviaId, ids.maxId].sort());
    const controlled = d.keepsakesYouControl.map((a) => a.id);
    expect(controlled).toEqual(expect.arrayContaining([ids.assetFamily, ids.assetExtended, ids.assetOnlyMe]));
    expect(controlled).not.toContain(ids.assetJoFamily); // Jo's upload is Jo's record
    expect(controlled).not.toContain(ids.assetBloomFamily); // another family entirely
  });

  it('08-B11: help-form messages are in it — sent signed in, or signed out from the same address — and nobody else’s', async () => {
    const [sam] = await db.select({ email: schema.accounts.email }).from(schema.accounts).where(eq(schema.accounts.id, ids.samId));
    const refs = [`T-${randomUUID().slice(0, 8)}`, `T-${randomUUID().slice(0, 8)}`, `T-${randomUUID().slice(0, 8)}`];
    await db.insert(schema.supportRequests).values([
      { ref: refs[0]!, topic: 'order-change', accountId: ids.samId, email: sam!.email!, message: 'signed in: please change my mug' },
      { ref: refs[1]!, topic: 'other', accountId: null, email: sam!.email!.toLowerCase(), message: 'signed out, same address' },
      { ref: refs[2]!, topic: 'other', accountId: ids.rosieId, email: 'someone-else@example.test', message: 'not Sam’s' },
    ]);
    try {
      const mine = (await collectAccountData(db, ids.samId)).yourHelpMessages;
      expect(mine.map((m) => m.ref).sort()).toEqual([refs[0], refs[1]].sort());
      expect(mine.find((m) => m.ref === refs[0])?.message).toBe('signed in: please change my mug');
      expect((await collectAccountData(db, ids.rosieId)).yourHelpMessages.map((m) => m.ref)).toEqual([refs[2]]);
    } finally {
      await db.delete(schema.supportRequests).where(inArray(schema.supportRequests.ref, refs));
    }
  });

  it('a relative gets their own record — not the family’s little ones or invites', async () => {
    const d = await collectAccountData(db, ids.rosieId);
    expect(d.familyMemberships.map((m) => m.familyId)).toContain(ids.hartleyId);
    expect(d.littleOnes).toEqual([]);
    expect(d.invitesSent).toEqual([]);
    expect(d.keepsakesYouControl).toEqual([]);
  });
});
