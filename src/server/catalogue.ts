import { eq } from 'drizzle-orm';
import { printTemplates, productVariantProviders, productVariants, products } from '@/db/schema';
import { CATALOGUE, type PricedCatalogue } from '@/pricing';
import { mmToPx } from './print/geometry';
import type { DbHandle } from './db';

export { mmToPx };

/**
 * The price list the pricing engine prices against, loaded from the DB. While the
 * catalogue is unseeded it falls back to the static {@link CATALOGUE}, so pricing
 * keeps working either way. The CLIENT never supplies prices — this is the
 * server-authoritative source.
 */
export async function getCatalogue(db: DbHandle): Promise<PricedCatalogue> {
  const rows = await db
    .select({ key: products.key, label: products.label, active: products.active, pricePence: productVariants.pricePence, variantActive: productVariants.active })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id));

  const map: PricedCatalogue = {};
  for (const r of rows) {
    if (!r.active || !r.variantActive) continue;
    // one variant per product in Phase 0; first wins deterministically
    if (!Object.prototype.hasOwnProperty.call(map, r.key)) map[r.key] = { pricePence: r.pricePence, label: r.label };
  }
  return Object.keys(map).length > 0 ? map : CATALOGUE; // fallback while unseeded
}

// Category + PLACEHOLDER print geometry (mm) per product. Real geometry + SKUs
// come from the Prodigi sync (TO-VERIFY) — these only populate the schema so the
// foundation is real. ADDONs (gift wrap) have no print template.
const DEFS: Record<
  string,
  {
    category: 'PRINT' | 'MUG' | 'APPAREL' | 'CUSHION' | 'BLANKET' | 'BOOK' | 'PUZZLE' | 'BAG' | 'CARD' | 'ADDON';
    print?: { wMm: number; hMm: number; dpi?: number };
  }
> = {
  card: { category: 'CARD', print: { wMm: 148, hMm: 105 } },
  framedPrint: { category: 'PRINT', print: { wMm: 210, hMm: 297 } },
  mug: { category: 'MUG', print: { wMm: 200, hMm: 85 } },
  kidsTee: { category: 'APPAREL', print: { wMm: 280, hMm: 350 } },
  cushion: { category: 'CUSHION', print: { wMm: 450, hMm: 450 } },
  blanket: { category: 'BLANKET', print: { wMm: 1000, hMm: 750, dpi: 150 } },
  storybook: { category: 'BOOK', print: { wMm: 200, hMm: 200 } },
  jigsaw: { category: 'PUZZLE', print: { wMm: 280, hMm: 200 } },
  toteBag: { category: 'BAG', print: { wMm: 350, hMm: 400 } },
  giftWrap: { category: 'ADDON' },
};

/**
 * Seed/refresh the catalogue from the static {@link CATALOGUE} (price + label) plus
 * the placeholder geometry above. Idempotent (upsert by key/sku/variant). Run once
 * per environment; pricing then reads the DB.
 */
export async function seedCatalogue(db: DbHandle): Promise<{ products: number }> {
  const keys = Object.keys(CATALOGUE) as (keyof typeof CATALOGUE)[];
  let sortOrder = 0;
  for (const key of keys) {
    const entry = CATALOGUE[key];
    const def = DEFS[key] ?? { category: 'ADDON' as const };

    const [product] = await db
      .insert(products)
      .values({ key, category: def.category, label: entry.label, active: true, sortOrder: sortOrder++ })
      .onConflictDoUpdate({ target: products.key, set: { category: def.category, label: entry.label, active: true } })
      .returning();

    const [variant] = await db
      .insert(productVariants)
      .values({ productId: product!.id, sku: key, label: entry.label, pricePence: entry.pricePence })
      .onConflictDoUpdate({ target: productVariants.sku, set: { productId: product!.id, label: entry.label, pricePence: entry.pricePence } })
      .returning();

    if (def.print) {
      const dpi = def.print.dpi ?? 300;
      const { wMm, hMm } = def.print;
      const wPx = mmToPx(wMm, dpi);
      const hPx = mmToPx(hMm, dpi);
      const tpl = {
        orientation: (wMm > hMm ? 'LANDSCAPE' : wMm < hMm ? 'PORTRAIT' : 'SQUARE') as 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE',
        printWidthMm: wMm,
        printHeightMm: hMm,
        requiredDpi: dpi,
        printWidthPx: wPx,
        printHeightPx: hPx,
        aspectMilli: Math.round((wMm / hMm) * 1000),
        minSourceWidthPx: wPx,
        minSourceHeightPx: hPx,
      };
      await db
        .insert(printTemplates)
        .values({ variantId: variant!.id, ...tpl })
        .onConflictDoUpdate({ target: printTemplates.variantId, set: tpl });
    }

    await db
      .insert(productVariantProviders)
      .values({ variantId: variant!.id, provider: 'PRODIGI', providerSku: `PRODIGI-PLACEHOLDER-${key}`, isDefault: true })
      .onConflictDoNothing();
  }
  return { products: keys.length };
}
