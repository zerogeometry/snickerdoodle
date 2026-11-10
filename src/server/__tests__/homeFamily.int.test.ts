import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, families, memberships } from '@/db/schema';
import { ensureHomeFamily, listActiveFamilies, resolveHomeFamily, resolveKeepFamily } from '@/server/onboarding';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/** A brand-new parent's first visit fires several server actions and loaders at once (keep,
 * keepsake picker, home). Each one asks for "their family" — and the very first time, each one
 * used to find none and make one, leaving the parent with two "Sam's family" boxes and their
 * keepsake filed in one while the page looked in the other. One account gets ONE home family. */
describe.skipIf(!DB)('one home family per new account, however many first calls race', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const nonce = Math.random().toString(36).slice(2, 8);
  const accountIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false, max: 12 }); // a real pool: the calls truly run side by side
    db = drizzle(client, { schema });
  });
  afterAll(async () => {
    if (accountIds.length) {
      const owned = await db.select({ id: families.id }).from(families).where(inArray(families.ownerAccountId, accountIds));
      await db.delete(memberships).where(inArray(memberships.accountId, accountIds));
      if (owned.length) await db.delete(families).where(inArray(families.id, owned.map((f) => f.id)));
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
    }
    await client.end();
  });

  const freshAccount = async (tag: string) => {
    const [a] = await db.insert(accounts).values({ email: `homefam-${tag}-${nonce}@example.test`, displayName: 'Sam' }).returning();
    accountIds.push(a!.id);
    return a!;
  };
  const ownedFamilies = (accountId: string) =>
    db.select({ id: families.id }).from(families).where(eq(families.ownerAccountId, accountId));
  const ownerRows = (accountId: string) =>
    db
      .select({ familyId: memberships.familyId })
      .from(memberships)
      .where(and(eq(memberships.accountId, accountId), eq(memberships.isOwner, true), eq(memberships.status, 'ACTIVE')));

  it('eight first calls to ensureHomeFamily at once → one family, one owner membership, the same id back', async () => {
    const a = await freshAccount('ensure');
    const ids = await Promise.all(Array.from({ length: 8 }, () => ensureHomeFamily(db, a.id, a.displayName)));
    expect(new Set(ids).size).toBe(1);
    expect(await ownedFamilies(a.id)).toEqual([{ id: ids[0] }]);
    expect(await ownerRows(a.id)).toEqual([{ familyId: ids[0] }]);
  });

  it('the first-visit mix (keep + picker + home loaders) at once → one family, and they all agree on it', async () => {
    const a = await freshAccount('mix');
    const ids = await Promise.all([
      resolveKeepFamily(db, a.id, a.displayName).then((r) => r.familyId),
      resolveHomeFamily(db, a.id, a.displayName),
      resolveKeepFamily(db, a.id, a.displayName).then((r) => r.familyId),
      resolveHomeFamily(db, a.id, a.displayName),
      ensureHomeFamily(db, a.id, a.displayName),
      resolveHomeFamily(db, a.id, a.displayName),
    ]);
    expect(new Set(ids).size).toBe(1);
    const all = await listActiveFamilies(db, a.id);
    expect(all.map((f) => f.familyId)).toEqual([ids[0]]); // no switcher: a single box
    expect((await db.select().from(families).where(eq(families.id, ids[0]!)))[0]!.displayName).toBe("Sam's family");
  });

  it('still idempotent one call at a time', async () => {
    const a = await freshAccount('serial');
    const first = await ensureHomeFamily(db, a.id, a.displayName);
    expect(await ensureHomeFamily(db, a.id, a.displayName)).toBe(first);
    expect(await resolveHomeFamily(db, a.id, a.displayName)).toBe(first);
    expect(await ownedFamilies(a.id)).toHaveLength(1);
  });
});
