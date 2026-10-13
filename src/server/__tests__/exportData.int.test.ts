import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    for (const key of ['account', 'familyMemberships', 'littleOnes', 'invitesSent', 'giftLists', 'keepsakesYouControl', 'savedForLater', 'orders', 'consents', 'credits', 'referralCodes', 'birthdayNudgesSent', 'yourRequestsToUs']) {
      expect(d).toHaveProperty(key);
    }
    expect(d.account?.id).toBe(ids.samId);
    expect(d.littleOnes.map((c) => c.id).sort()).toEqual([ids.oliviaId, ids.maxId].sort());
    const controlled = d.keepsakesYouControl.map((a) => a.id);
    expect(controlled).toEqual(expect.arrayContaining([ids.assetFamily, ids.assetExtended, ids.assetOnlyMe]));
    expect(controlled).not.toContain(ids.assetJoFamily); // Jo's upload is Jo's record
    expect(controlled).not.toContain(ids.assetBloomFamily); // another family entirely
  });

  it('a relative gets their own record — not the family’s little ones or invites', async () => {
    const d = await collectAccountData(db, ids.rosieId);
    expect(d.familyMemberships.map((m) => m.familyId)).toContain(ids.hartleyId);
    expect(d.littleOnes).toEqual([]);
    expect(d.invitesSent).toEqual([]);
    expect(d.keepsakesYouControl).toEqual([]);
  });
});
