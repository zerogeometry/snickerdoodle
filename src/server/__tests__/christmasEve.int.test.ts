import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, orderItemArtwork, orderItems, orders } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { placeOrder } from '@/server/orders';
import { checkEve, eveOffer } from '@/server/bundle';
import { seedCatalogue } from '@/server/catalogue';
import type { DbHandle } from '@/server/db';

const URL = process.env.DATABASE_URL;

// The CHRISTMAS EVE BUNDLE against Postgres: split into its three pieces' own variants, every drawing
// through the same authz + moderation gates as any print.
describe.skipIf(!URL)('christmas eve bundle — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (assetIds.length) await db.delete(assets).where(inArray(assets.id, assetIds));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });
  const mk = async (o: Partial<typeof assets.$inferInsert> = {}) => {
    const [a] = await db.insert(assets).values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR', ...o }).returning();
    assetIds.push(a!.id);
    return a!;
  };

  it('two bundles (one per child) → three Prodigi items each, the right mug colour, to the penny', async () => {
    const [olivia, max, star] = [await mk(), await mk(), await mk()];
    const res = await placeOrder(db, {
      items: [
        { productKey: 'christmasEveBundle', qty: 1, eve: { drawing: { assetId: olivia.id }, mugColour: 'red', pricePence: 1 } },
        { productKey: 'christmasEveBundle', qty: 1, eve: { drawing: { assetId: max.id }, own: { ceramicOrnament: { assetId: star.id } }, mugColour: 'blue' } },
      ],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    expect(res.ok).toBe(true);
    const [o] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    expect(o!.subtotalPence).toBe(12400);
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o!.id));
    expect(lines.reduce((n, l) => n + l.linePence, 0)).toBe(12400);
    expect(lines.map((l) => l.spec?.providerSku).sort()).toEqual(['H-MUG-11OZ-WBL', 'H-MUG-11OZ-WR', 'XMAS-PORC-BAUB', 'XMAS-PORC-BAUB', 'XMAS-SACK', 'XMAS-SACK']);
    const arts = await db.select().from(orderItemArtwork).where(inArray(orderItemArtwork.orderItemId, lines.map((l) => l.id)));
    const ornaments = lines.filter((l) => l.spec?.providerSku === 'XMAS-PORC-BAUB').map((l) => arts.find((a) => a.orderItemId === l.id)!.assetId).sort();
    expect(ornaments).toEqual([olivia.id, star.id].sort()); // Max's bundle carries the star on its ornament
  });

  it('no drawing → refused; a stranger’s drawing on any piece → AuthzError; un-cleared → refused', async () => {
    const mine = await mk();
    const flagged = await mk({ moderationStatus: 'FLAGGED' });
    await expect(placeOrder(db, { items: [{ productKey: 'christmasEveBundle', qty: 1, eve: {} }], account: { id: ids.samId }, joinProvenance: null })).rejects.toThrow(/needs a drawing/);
    await expect(
      placeOrder(db, { items: [{ productKey: 'christmasEveBundle', qty: 1, eve: { drawing: { assetId: mine.id }, own: { mug: { assetId: ids.assetBloomFamily } } } }], account: { id: ids.samId }, joinProvenance: null }),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      placeOrder(db, { items: [{ productKey: 'christmasEveBundle', qty: 1, eve: { drawing: { assetId: flagged.id } } }], account: { id: ids.samId }, joinProvenance: null }),
    ).rejects.toThrow(/cleared for printing/);
  });

  it('add-to-basket: buying access builds from existing art; a stranger’s drawing does not', async () => {
    const ext = await mk({ visibility: 'EXTENDED' });
    expect(await checkEve(db, { accountId: ids.rosieId, uploadClaims: [], eve: { drawing: { assetId: ext.id } } })).toMatchObject({ ok: true, pricePence: 6200 });
    expect(await checkEve(db, { accountId: ids.samId, uploadClaims: [], eve: { drawing: { assetId: ext.id }, own: { sack: { assetId: ids.assetBloomFamily } } } })).toEqual({ ok: false, reason: 'not-allowed' });
    expect(await checkEve(db, { accountId: null, uploadClaims: [], eve: { drawing: { assetId: ext.id } } })).toEqual({ ok: false, reason: 'not-allowed' });
    expect(await checkEve(db, { accountId: ids.samId, uploadClaims: [], eve: { mugColour: 'red' } })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('the offer: £62, £74 separately', async () => {
    expect(await eveOffer(db)).toMatchObject({ pricePence: 6200, separatelyPence: 7400 });
  });
});
