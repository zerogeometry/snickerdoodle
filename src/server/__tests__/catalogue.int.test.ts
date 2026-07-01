import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { printTemplates, productVariants, products } from '@/db/schema';
import { getCatalogue, seedCatalogue } from '@/server/catalogue';
import { CATALOGUE, quote } from '@/pricing';
import type { DbHandle } from '@/server/db';

const URL = process.env.DATABASE_URL;
const TEST_KEY = '__catalogue_test_widget__';

describe.skipIf(!URL)('DB-backed catalogue + pricing — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    await seedCatalogue(db); // idempotent; leaves the shared catalogue at static prices
  });

  afterAll(async () => {
    await db.delete(products).where(eq(products.key, TEST_KEY)); // only the throwaway; leave the real catalogue
    await client.end();
  });

  it('seeds products → variants → print templates → provider mapping from the static catalogue', async () => {
    const res = await seedCatalogue(db);
    expect(res.products).toBe(Object.keys(CATALOGUE).length);

    // a printable product has a template; an add-on (gift wrap) does not
    const [framed] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    const tpl = await db.select().from(printTemplates).where(eq(printTemplates.variantId, framed!.id));
    expect(tpl).toHaveLength(1);
    expect(tpl[0]!.printWidthMm).toBe(279); // default framed print is now 11×14″ (279mm wide)

    const [wrap] = await db.select().from(productVariants).where(eq(productVariants.sku, 'giftWrap'));
    expect(await db.select().from(printTemplates).where(eq(printTemplates.variantId, wrap!.id))).toHaveLength(0);
  });

  it('getCatalogue returns DB prices matching the static seed; pricing uses them, never the client', async () => {
    const cat = await getCatalogue(db);
    expect(cat.framedPrint!.pricePence).toBe(CATALOGUE.framedPrint.pricePence);
    // client tries to smuggle a 1p price → ignored; DB price wins
    const q = quote([{ productKey: 'framedPrint', qty: 1, pricePence: 1 } as never], { catalogue: cat });
    expect(q.subtotalPence).toBe(CATALOGUE.framedPrint.pricePence);
  });

  it('the DB is authoritative — a price set in the DB drives pricing (proved on a throwaway product)', async () => {
    const [p] = await db
      .insert(products)
      .values({ key: TEST_KEY, category: 'ADDON', label: 'test widget' })
      .onConflictDoUpdate({ target: products.key, set: { label: 'test widget' } })
      .returning();
    await db
      .insert(productVariants)
      .values({ productId: p!.id, sku: TEST_KEY, label: 'test widget', pricePence: 777 })
      .onConflictDoUpdate({ target: productVariants.sku, set: { pricePence: 777, productId: p!.id } });

    const cat = await getCatalogue(db);
    expect(cat[TEST_KEY]!.pricePence).toBe(777);
    expect(quote([{ productKey: TEST_KEY, qty: 2 }], { catalogue: cat }).subtotalPence).toBe(1554);
  });

  it('seeding is idempotent — no duplicate variants', async () => {
    await seedCatalogue(db);
    expect(await db.select().from(productVariants).where(eq(productVariants.sku, 'mug'))).toHaveLength(1);
  });
});
