import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { accounts, assets, auditRecords, children, families, giftLinks, invites, memberships, orders, sessions, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { closeAccount } from '@/server/accountClosure';
import { createGiftLink } from '@/server/giftLinks';
import { ingestOriginalAsset } from '@/server/ingest';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 3, g: 3, b: 3 } } }).png().toBuffer();

/**
 * Closing an account is real erasure: the owned family and everything in it go (bytes + rows),
 * the person's own uploads elsewhere go, account-level data goes, orders keep only the money,
 * and the login row can never sign in again. Needs Postgres + S3 (real bytes are erased).
 */
describe.skipIf(!DB || !S3)('closeAccount — right to erasure', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (ids) {
      await db.delete(giftLinks).where(inArray(giftLinks.familyId, [ids.hartleyId, ids.bloomId]));
      await cleanupDemoFamilies(db, ids);
    }
    await client.end();
  });

  it('waits while an order is still being made', async () => {
    const [o] = await db
      .insert(orders)
      .values({ ref: `SNK-close-wait-${ids.nonce}`, accountId: ids.blakeId, status: 'PAID', subtotalPence: 100, deliveryPence: 0, totalPence: 100 })
      .returning();
    orderIds.push(o!.id);
    expect(await closeAccount(db, ids.blakeId)).toEqual({ ok: false, reason: 'order-in-flight' });
    await db.update(orders).set({ status: 'SHIPPED', buyerEmail: 'blake@example.test', shippingAddress: { name: 'Blake', line1: '1 Road', townOrCity: 'Town', postcode: 'AB1 2CD', countryCode: 'GB' }, giftFromName: 'Blake' }).where(eq(orders.id, o!.id));
  });

  it('erases the owned family and everything in it; the order keeps only the money', async () => {
    const blake = await resolveViewerContext(db, ids.blakeId, ids.bloomId);
    const art = await ingestOriginalAsset(db, blake, { familyId: ids.bloomId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    await createGiftLink(db, blake, { familyId: ids.bloomId, assetIds: [art.assetId] });
    await db.insert(children).values({ familyId: ids.bloomId, firstName: 'Wren', controllerAccountId: ids.blakeId });
    await db.insert(sessions).values({ sessionToken: `close-${ids.nonce}`, userId: ids.blakeId, expires: new Date(Date.now() + 86_400_000) });
    const familyAssets = (await db.select({ id: assets.id }).from(assets).where(eq(assets.familyId, ids.bloomId))).map((a) => a.id);
    expect(familyAssets.length).toBeGreaterThan(0);

    const res = await closeAccount(db, ids.blakeId);
    expect(res).toMatchObject({ ok: true, familiesClosed: 1 });

    expect(await db.select().from(families).where(eq(families.id, ids.bloomId))).toHaveLength(0);
    expect(await db.select().from(assets).where(inArray(assets.id, familyAssets))).toHaveLength(0);
    expect(await db.select().from(storageObjects).where(eq(storageObjects.assetId, art.assetId))).toHaveLength(0);
    expect(await db.select().from(children).where(eq(children.familyId, ids.bloomId))).toHaveLength(0);
    expect(await db.select().from(giftLinks).where(eq(giftLinks.familyId, ids.bloomId))).toHaveLength(0);
    expect(await db.select().from(invites).where(eq(invites.familyId, ids.bloomId))).toHaveLength(0);
    expect(await db.select().from(memberships).where(eq(memberships.familyId, ids.bloomId))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, ids.blakeId))).toHaveLength(0);

    const [acct] = await db.select().from(accounts).where(eq(accounts.id, ids.blakeId));
    expect(acct!.email).toBe(`closed-${ids.blakeId}@closed.invalid`);
    expect(acct!.displayName).toBeNull();
    expect(acct!.emailVerifiedAt).toBeNull();

    const [o] = await db.select().from(orders).where(eq(orders.id, orderIds[0]!));
    expect(o).toMatchObject({ totalPence: 100, buyerEmail: null, shippingAddress: null, giftFromName: null, familyId: null });

    const audits = await db.select().from(auditRecords).where(eq(auditRecords.targetId, ids.blakeId));
    expect(audits.some((a) => a.event === 'ACCOUNT_CLOSED')).toBe(true);
  });

  it('a member closing leaves other families, taking only what they control there', async () => {
    // Jo is a member of Sam's family and controls one of its keepsakes; Sam controls the rest
    const samsAsset = ids.assetFamily;
    const res = await closeAccount(db, ids.joId);
    expect(res).toMatchObject({ ok: true, familiesClosed: 0 });

    expect(await db.select().from(assets).where(eq(assets.id, ids.assetJoFamily))).toHaveLength(0); // Jo's own upload
    expect(await db.select().from(assets).where(eq(assets.id, samsAsset))).toHaveLength(1); // Sam's family keeps the rest
    expect(await db.select().from(families).where(eq(families.id, ids.hartleyId))).toHaveLength(1);
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    expect(jo.membership?.status).toBe('LEFT');
  });
});
