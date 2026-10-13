import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, auditRecords, children, families, memberships } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { closeAccount, closurePreview } from '@/server/accountClosure';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/** Closing the owner's account can hand the family to another member, so it carries on —
 * minus anything the outgoing parent kept "only me". */
describe.skipIf(!DB)('closeAccount with a family handover', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    log.mockRestore();
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('the preview shows who could take over and what is private', async () => {
    const p = await closurePreview(db, ids.samId);
    const hartley = p.ownedFamilies.find((f) => f.familyId === ids.hartleyId)!;
    expect(hartley.members.map((m) => m.accountId).sort()).toEqual([ids.joId, ids.rosieId].sort()); // ACTIVE only — not Mallory
    expect(hartley.privateKeepsakes).toBe(1);
    expect(hartley.littleOnes).toBe(2);
  });

  it('refuses a handover to someone who isn’t an active member', async () => {
    expect(await closeAccount(db, ids.samId, new Date(), { handOver: { familyId: ids.hartleyId, newOwnerAccountId: ids.malloryId } })).toEqual({ ok: false, reason: 'bad-handover' });
    expect(await closeAccount(db, ids.samId, new Date(), { handOver: { familyId: ids.hartleyId, newOwnerAccountId: ids.blakeId } })).toEqual({ ok: false, reason: 'bad-handover' });
    const [f] = await db.select().from(families).where(eq(families.id, ids.hartleyId));
    expect(f!.ownerAccountId).toBe(ids.samId); // nothing happened
  });

  it('hands the family to Jo: little ones + shared keepsakes move, "only me" is erased', async () => {
    const res = await closeAccount(db, ids.samId, new Date(), { handOver: { familyId: ids.hartleyId, newOwnerAccountId: ids.joId } });
    expect(res).toMatchObject({ ok: true, familiesClosed: 0 });

    const [f] = await db.select().from(families).where(eq(families.id, ids.hartleyId));
    expect(f!.ownerAccountId).toBe(ids.joId);
    const [jo] = await db.select().from(memberships).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.joId)));
    expect(jo).toMatchObject({ isOwner: true, status: 'ACTIVE', circle: 'FAMILY', accessLevel: 'CONTRIBUTE', seesOccasions: true });
    expect(await db.select().from(memberships).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.samId)))).toHaveLength(0);

    const kids = await db.select().from(children).where(eq(children.familyId, ids.hartleyId));
    expect(kids.every((k) => k.controllerAccountId === ids.joId)).toBe(true);
    for (const id of [ids.assetFamily, ids.assetExtended]) {
      const [a] = await db.select().from(assets).where(eq(assets.id, id));
      expect(a!.controllerAccountId).toBe(ids.joId);
    }
    expect(await db.select().from(assets).where(eq(assets.id, ids.assetOnlyMe))).toHaveLength(0); // private to Sam → gone

    const [audit] = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'FAMILY_HANDED_OVER'), eq(auditRecords.familyId, ids.hartleyId)));
    expect(audit!.targetId).toBe(ids.joId);
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toContain('[family-handover]');
    // Rosie is still in the family under its new head
    const [rosie] = await db.select().from(memberships).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.rosieId)));
    expect(rosie!.status).toBe('ACTIVE');
  });
});
