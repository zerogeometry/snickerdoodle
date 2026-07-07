import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { productVariants, products } from '@/db/schema';
import { seedCatalogue } from '@/server/catalogue';
import { loadPrintableVariants } from '@/server/studio-variants';
import type { DbHandle } from '@/server/db';

const URL = process.env.DATABASE_URL;

/**
 * The placement editor is ALWAYS scoped to the ONE creation Customize sent it (founder
 * call 2026-07-07 — no catalogue in there). The bug this pins: Customize hands the
 * editor the SPECIFIC variant the shopper chose (its exact size/colour/orientation),
 * which is almost never the product's DEFAULT variant — so a defaults-only loader made
 * the scope miss and the editor fell back to an arbitrary product (a fleece blanket).
 * loadPrintableVariants(db, focusVariantId) must return EXACTLY that variant, with its
 * own template so a landscape frame edits on a landscape canvas.
 */
describe.skipIf(!URL)('studio editor scope — the focused variant wins (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    await seedCatalogue(db);
  });

  afterAll(async () => {
    await client.end();
  });

  it('a SPECIFIC non-default landscape frame → the editor scopes to exactly it, on a landscape canvas', async () => {
    const [frame] = await db.select().from(products).where(eq(products.key, 'framedPrint'));
    // a real, non-default landscape frame variant (what Customize would send)
    const [landscape] = await db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, frame!.id), eq(productVariants.isDefault, false)))
      .then((rows) => rows.filter((v) => (v.attributes as Record<string, string> | null)?.orientation === 'landscape'));
    expect(landscape, 'a landscape frame variant is seeded').toBeTruthy();
    expect(landscape!.isDefault).toBe(false);

    const scoped = await loadPrintableVariants(db, landscape!.id);
    // exactly ONE variant — the one we asked for, never the whole catalogue
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.id).toBe(landscape!.id);
    expect(scoped[0]!.productKey).toBe('framedPrint');
    // its OWN template drives the canvas: landscape ⇒ wider than tall
    expect(scoped[0]!.template.printWidthPx).toBeGreaterThan(scoped[0]!.template.printHeightPx);
    // the pill names the exact creation (size + orientation surfaced)
    expect(scoped[0]!.label.toLowerCase()).toContain('landscape');
  });

  it('the portrait default frame → a portrait canvas (the same scoping, taller than wide)', async () => {
    const [portrait] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    const scoped = await loadPrintableVariants(db, portrait!.id);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.id).toBe(portrait!.id);
    expect(scoped[0]!.template.printHeightPx).toBeGreaterThan(scoped[0]!.template.printWidthPx);
  });

  it('an UNKNOWN focus id falls back to defaults so the editor still opens (never throws)', async () => {
    const defaults = await loadPrintableVariants(db, '00000000-0000-0000-0000-000000000000');
    expect(defaults.length).toBeGreaterThan(1); // one representative per printable product
    // every fallback entry is a product DEFAULT — the scoped landscape id is NOT among them
    const skus = await db
      .select({ id: productVariants.id, isDefault: productVariants.isDefault })
      .from(productVariants);
    const byId = new Map(skus.map((s) => [s.id, s.isDefault]));
    for (const v of defaults) expect(byId.get(v.id)).toBe(true);
  });

  it('NO focus → defaults (the legacy member-home entry), one per printable product', async () => {
    const defaults = await loadPrintableVariants(db);
    expect(defaults.length).toBeGreaterThan(1);
    // no duplicate products in the defaults list
    const keys = defaults.map((v) => v.productKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
