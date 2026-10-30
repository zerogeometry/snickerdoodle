import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { orders, productVariants } from '@/db/schema';
import { placeOrder } from '@/server/orders';
import { getCatalogue, loadCatalogue, seedCatalogue } from '@/server/catalogue';
import { ensureTestCosts } from '@/test/costFixture';
import type { DbHandle } from '@/server/db';

const URL = process.env.DATABASE_URL;

// MULTI-BUY against Postgres: the tiers come from the variant's LIVE costs (unit cost + first / plus-one
// post), the shop sees only the tiers (never the costs), and the order records the saving.
describe.skipIf(!URL)('multi-buy — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const orderIds: string[] = [];
  let before: { unitCostPence: number | null; postFirstPence: number | null; postExtraPence: number | null } | undefined;
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    await seedCatalogue(db);
    await ensureTestCosts(db); // first, so the cost restored afterwards is never a null over the fixture
    [before] = await db.select({ unitCostPence: productVariants.unitCostPence, postFirstPence: productVariants.postFirstPence, postExtraPence: productVariants.postExtraPence }).from(productVariants).where(eq(productVariants.sku, 'mug'));
    // the mug's real costs (Prodigi GB sheet: £5 + £4.30 post, +£1 per extra)
    await db.update(productVariants).set({ unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 }).where(eq(productVariants.sku, 'mug'));
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (before) await db.update(productVariants).set(before).where(eq(productVariants.sku, 'mug'));
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  it('the shop shows the mug’s tiers (from its costs) — and never the costs', async () => {
    const mug = (await loadCatalogue(db)).find((p) => p.key === 'mug')!;
    const v = mug.variants.find((x) => x.sku === 'mug')!;
    expect(v.multiBuyBps).toEqual([1500, 1500, 1500, 1500]);
    expect(JSON.stringify(mug)).not.toMatch(/unitCost|postFirst|postExtra|930/);
    expect((await getCatalogue(db)).mug).toMatchObject({ unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 });
  });

  it('two mugs: 15% multi-buy + the £3 same-parcel saving, recorded on the order', async () => {
    const res = await placeOrder(db, { items: [{ productKey: 'mug', qty: 2 }], account: null, joinProvenance: null });
    expect(res.ok).toBe(true);
    const [o] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    expect(o).toMatchObject({ subtotalPence: 3600, multiBuySavingPence: 540, parcelSavingPence: 300, totalPence: 2760 });
  });
});
