import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { printTemplates, productVariantProviders, productVariants, products } from '@/db/schema';
import { PHONE_MODELS, prodigiCaseSku, type CaseGrade } from '@/lib/phone-cases';
import { getCatalogue, loadCatalogue, seedCatalogue } from '@/server/catalogue';
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

  it('seeds in a bounded number of queries — batched per product, never four per variant (the Netlify 504)', async () => {
    let queries = 0;
    const counted = postgres(URL!, { prepare: false, debug: () => { queries++; } });
    try {
      const res = await seedCatalogue(drizzle(counted, { schema }));
      expect(res.variants).toBeGreaterThan(400);
      // ~6 per product + the retire/popularity tail; the old per-row seed was ~4 × variants (1,700+)
      expect(queries).toBeLessThan(res.products * 8 + 40);
    } finally {
      await counted.end();
    }
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

  it('STOREFRONT curation: the shop shows only visibleInShop products (the launch range + the ready D21 expansion); the curation view sees everything', async () => {
    // the storefront default — what every shopper-facing surface renders (def order = sortOrder)
    const shop = await loadCatalogue(db);
    expect(shop.map((p) => p.key)).toEqual(['framedPrint', 'mug', 'cushion', 'kidsTee', 'jigsaw', 'blanket', 'card', 'cardPack', 'adultTee', 'phoneCase', 'socks', 'heightChart', 'wrappingPaper', 'teaTowel', 'playingCards']);

    // the dev curation workbench — every ACTIVE product regardless of the flag
    const all = await loadCatalogue(db, { includeHidden: true });
    expect(all.length).toBeGreaterThan(10);
    expect(all.some((p) => p.key === 'babyBodysuit')).toBe(true); // a hidden product

    // hidden ≠ inactive: hidden products remain fully priceable in the backend
    // (display curation only — `active` stays the sellable axis)
    const cat = await getCatalogue(db);
    expect(cat.babyBodysuit!.pricePence).toBeGreaterThan(0);

    // and the flag itself is seeded exactly as the founder set it
    const SHOWN = new Set(['framedPrint', 'mug', 'cushion', 'kidsTee', 'jigsaw', 'blanket', 'card', 'cardPack', 'adultTee', 'phoneCase', 'socks', 'heightChart', 'wrappingPaper', 'teaTowel', 'playingCards']);
    const flags = await db.select({ key: products.key, v: products.visibleInShop }).from(products);
    for (const f of flags.filter((x) => x.key !== TEST_KEY)) {
      expect(f.v, f.key).toBe(SHOWN.has(f.key));
    }
  });

  it('BLANKET is WHITE-only, medium+large × portrait/landscape (4 variants, priced, no colour)', async () => {
    const rows = await db
      .select({ sku: productVariants.sku, attrs: productVariants.attributes, price: productVariants.pricePence, active: productVariants.active })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(products.key, 'blanket'));
    const live = rows.filter((r) => r.active);
    expect(live).toHaveLength(4); // medium/large × portrait/landscape — no pink/blue
    for (const r of live) {
      const a = r.attrs as Record<string, string>;
      expect(a.colour, `${r.sku} carries no colour dimension`).toBeUndefined(); // white is implicit
      expect(['portrait', 'landscape']).toContain(a.orientation);
      expect(['medium', 'large']).toContain(a.size);
    }
    // price by SIZE (same both orientations); pink/blue SKUs are gone (deactivated)
    const priceOf = (size: string) => live.find((r) => (r.attrs as Record<string, string>).size === size)!.price;
    expect(priceOf('medium')).toBe(6000);
    expect(priceOf('large')).toBe(7500);
    const pinkBlue = rows.filter((r) => r.active && /PINK|BLUE/i.test((r.attrs as Record<string, string>).colour ?? ''));
    expect(pinkBlue).toHaveLength(0);
  });

  it('PHONE CASES: every phone × grade × finish Prodigi makes, at its exact SKU, print size and price', async () => {
    const rows = await db
      .select({ sku: productVariants.sku, attrs: productVariants.attributes, price: productVariants.pricePence, wPx: printTemplates.printWidthPx, hPx: printTemplates.printHeightPx, bleed: printTemplates.bleedMm, providerSku: productVariantProviders.providerSku })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
      .innerJoin(productVariantProviders, eq(productVariantProviders.variantId, productVariants.id))
      .where(eq(products.key, 'phoneCase'));
    const expected = PHONE_MODELS.flatMap((m) => (['snap', 'tough'] as CaseGrade[]).filter((g) => m[g]).flatMap((g) => ['gloss', 'matte'].map((f) => ({ m, g, f }))));
    expect(rows).toHaveLength(expected.length); // 152 on 2026-10-21 — no two phones share a sku (S23 vs S23+)
    expect(new Set(rows.map((r) => r.sku)).size).toBe(rows.length);
    for (const { m, g, f } of expected) {
      const r = rows.find((x) => { const a = x.attrs as Record<string, string>; return a.size === m.name && a.grade === g && a.finish === f; });
      expect(r, `${m.name} ${g} ${f}`).toBeTruthy();
      expect(r!.providerSku).toBe(prodigiCaseSku(m, g, f as 'gloss' | 'matte'));
      expect([r!.wPx, r!.hPx]).toEqual([m[g]!.w, m[g]!.h]); // Prodigi's own printAreaSizes, not rounded from mm
      expect(r!.bleed).toBe(0); // the file IS the wrap
      expect(r!.price).toBe(g === 'snap' ? 2500 : 3000);
    }
    // tough-only phones never offer snap
    expect(rows.some((x) => { const a = x.attrs as Record<string, string>; return a.size === 'Pixel 9' && a.grade === 'snap'; })).toBe(false);
  });
});
