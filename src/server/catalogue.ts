import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { printTemplates, productVariantProviders, productVariants, products } from '@/db/schema';
import { CATALOGUE, type PricedCatalogue } from '@/pricing';
import { mmToPx } from './print/geometry';
import type { DbHandle } from './db';

export { mmToPx };

// ── Starter variant catalogue ────────────────────────────────────────────────
// Sizes/colours/prices + the warm blurb here are PLACEHOLDERS. The real variant
// list, dimensions, specs and per-variant prices come from the Prodigi catalogue
// sync (P3); these only give the flow real, shaped data to run on now. Each size
// carries its own print geometry; colours of the same size share it.
type SizeDef = { label: string; wMm: number; hMm: number; dpi?: number; pricePence: number };
type ProductDef = {
  category: 'PRINT' | 'MUG' | 'APPAREL' | 'CUSHION' | 'BLANKET' | 'BOOK' | 'PUZZLE' | 'BAG' | 'CARD' | 'ADDON';
  label: string;
  blurb: string;
  description: string;
  specs: Record<string, string>;
  sizes: Record<string, SizeDef>;
  colours?: string[];
  print: boolean;
};

const DEFS: Record<string, ProductDef> = {
  card: {
    category: 'CARD', label: 'card', blurb: 'a little card, a big smile', print: true,
    description: "A folded greeting card with your little one's artwork on the front — ready to write in and give.",
    specs: { material: '[Prodigi: 300gsm silk card]', finish: '[Prodigi: matte, scored fold]', inside: 'blank for your message' },
    sizes: { a5: { label: 'A5', wMm: 148, hMm: 210, pricePence: 400 }, a4: { label: 'A4', wMm: 210, hMm: 297, pricePence: 600 } },
  },
  framedPrint: {
    category: 'PRINT', label: 'framed print', blurb: 'made real, framed in gold', print: true,
    description: 'A gallery-quality print of the original, framed and ready to hang — the wonky bits framed in gold.',
    specs: { material: '[Prodigi: museum-grade matte paper]', frame: '[Prodigi: solid wood]', glazing: '[Prodigi: shatterproof]' },
    sizes: { a4: { label: 'A4', wMm: 210, hMm: 297, pricePence: 2200 }, a3: { label: 'A3', wMm: 297, hMm: 420, pricePence: 3200 } },
    colours: ['oak', 'black', 'white'],
  },
  mug: {
    category: 'MUG', label: 'mug', blurb: 'a morning cuppa, made magic', print: true,
    description: "Their masterpiece wrapped around a sturdy mug — for the grown-up who'll treasure every sip.",
    specs: { material: '[Prodigi: ceramic, 11oz]', care: '[Prodigi: dishwasher safe]' },
    sizes: { std: { label: 'one size', wMm: 200, hMm: 85, pricePence: 1400 } },
  },
  kidsTee: {
    category: 'APPAREL', label: 'kids tee', blurb: 'their masterpiece, worn with pride', print: true,
    description: 'A soft cotton tee with their own drawing printed on the front — made to be worn (and washed) again and again.',
    specs: { material: '[Prodigi: 100% organic cotton]', print: '[Prodigi: DTG]', care: '[Prodigi: wash at 30°]' },
    sizes: {
      '1-2': { label: 'age 1–2', wMm: 200, hMm: 250, pricePence: 1800 },
      '3-4': { label: 'age 3–4', wMm: 240, hMm: 300, pricePence: 1800 },
      '5-6': { label: 'age 5–6', wMm: 280, hMm: 350, pricePence: 1800 },
      '7-8': { label: 'age 7–8', wMm: 300, hMm: 380, pricePence: 1800 },
    },
    colours: ['white', 'sky', 'pink'],
  },
  cushion: {
    category: 'CUSHION', label: 'cushion', blurb: 'a squishy keepsake for the sofa', print: true,
    description: 'A plump cushion with their artwork on it — a keepsake you can actually hug.',
    specs: { material: '[Prodigi: soft-touch suede feel]', filling: '[Prodigi: included]' },
    sizes: { std: { label: 'one size', wMm: 450, hMm: 450, pricePence: 2800 } },
  },
  blanket: {
    category: 'BLANKET', label: 'blanket', blurb: 'cuddles, with their art woven in', print: true,
    description: 'A cosy blanket carrying their drawing — for snuggles that last long after they grow.',
    specs: { material: '[Prodigi: sherpa fleece]', care: '[Prodigi: machine washable]' },
    sizes: { std: { label: 'one size', wMm: 1000, hMm: 750, dpi: 150, pricePence: 4500 } },
  },
  storybook: {
    category: 'BOOK', label: 'storybook', blurb: "they're the hero of the story", print: true,
    description: 'A keepsake storybook starring your little one and their artwork — the tale they were always the hero of.',
    specs: { material: '[Prodigi: hardcover, matte laminate]', pages: '[Prodigi: 24pp]' },
    sizes: { std: { label: 'one size', wMm: 200, hMm: 200, pricePence: 2400 } },
  },
  jigsaw: {
    category: 'PUZZLE', label: 'jigsaw', blurb: 'piece their masterpiece together', print: true,
    description: 'Their drawing turned into a jigsaw — rainy-afternoon magic, piece by piece.',
    specs: { material: '[Prodigi: recycled board]', pieces: '[Prodigi: 30 pieces]' },
    sizes: { std: { label: 'one size', wMm: 280, hMm: 200, pricePence: 2000 } },
  },
  toteBag: {
    category: 'BAG', label: 'tote bag', blurb: 'carry their creativity everywhere', print: true,
    description: 'A roomy cotton tote with their artwork printed on — creativity you can carry to the shops.',
    specs: { material: '[Prodigi: heavyweight cotton]', handles: '[Prodigi: long]' },
    sizes: { std: { label: 'one size', wMm: 350, hMm: 400, pricePence: 1600 } },
  },
  giftWrap: {
    category: 'ADDON', label: 'gift wrap', blurb: 'a handwritten-style note + wrap', print: false,
    description: "We'll wrap it beautifully and tuck in a handwritten-style note.",
    specs: {},
    sizes: { std: { label: 'one size', wMm: 0, hMm: 0, pricePence: 300 } },
  },
};

/** Stable sku for a variant: the default keeps the legacy product key (back-compat). */
function variantSku(productKey: string, sizeCode: string, colour: string | undefined, isDefault: boolean): string {
  if (isDefault) return productKey;
  return [productKey, sizeCode === 'std' ? null : sizeCode, colour].filter(Boolean).join('-');
}

/**
 * The price list the pricing engine prices against, loaded from the DB. Keyed by
 * BOTH the variant sku AND (for the default variant) the product key, so a quick
 * add-by-product and a customise add-by-variant both resolve a price. The client
 * never supplies prices — this is the server-authoritative source. Falls back to
 * the static {@link CATALOGUE} while unseeded.
 */
export async function getCatalogue(db: DbHandle): Promise<PricedCatalogue> {
  const rows = await db
    .select({ productKey: products.key, productActive: products.active, sku: productVariants.sku, label: productVariants.label, pricePence: productVariants.pricePence, isDefault: productVariants.isDefault, variantActive: productVariants.active })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId));

  const map: PricedCatalogue = {};
  for (const r of rows) {
    if (!r.productActive || !r.variantActive) continue;
    map[r.sku] = { pricePence: r.pricePence, label: r.label };
    if (r.isDefault && !Object.prototype.hasOwnProperty.call(map, r.productKey)) {
      map[r.productKey] = { pricePence: r.pricePence, label: r.label };
    }
  }
  return Object.keys(map).length > 0 ? map : CATALOGUE;
}

// ── UI catalogue (products grouped with their variants) ──────────────────────
export interface CatalogueVariant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  pricePence: number;
  isDefault: boolean;
}
export interface CatalogueProduct {
  key: string;
  label: string;
  blurb: string | null;
  description: string | null;
  specs: Record<string, string>;
  category: string;
  fromPence: number;
  sizes: string[];
  colours: string[];
  variants: CatalogueVariant[];
}

/** Every active product with its variants — for the catalogue + customise screens. */
export async function loadCatalogue(db: DbHandle): Promise<CatalogueProduct[]> {
  const rows = await db
    .select({
      key: products.key, label: products.label, blurb: products.blurb, description: products.description, specs: products.specs, category: products.category, sortOrder: products.sortOrder,
      vId: productVariants.id, vSku: productVariants.sku, vAttrs: productVariants.attributes, vPrice: productVariants.pricePence, vDefault: productVariants.isDefault, vSort: productVariants.sortOrder,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(and(eq(products.active, true), eq(productVariants.active, true)))
    .orderBy(asc(products.sortOrder), asc(productVariants.sortOrder));

  const byKey = new Map<string, CatalogueProduct>();
  for (const r of rows) {
    let p = byKey.get(r.key);
    if (!p) {
      p = { key: r.key, label: r.label, blurb: r.blurb, description: r.description, specs: (r.specs as Record<string, string>) ?? {}, category: r.category, fromPence: r.vPrice, sizes: [], colours: [], variants: [] };
      byKey.set(r.key, p);
    }
    const attrs = (r.vAttrs as Record<string, string>) ?? {};
    p.variants.push({ id: r.vId, sku: r.vSku, attributes: attrs, pricePence: r.vPrice, isDefault: r.vDefault });
    p.fromPence = Math.min(p.fromPence, r.vPrice);
    if (attrs.size && !p.sizes.includes(attrs.size)) p.sizes.push(attrs.size);
    if (attrs.colour && !p.colours.includes(attrs.colour)) p.colours.push(attrs.colour);
  }
  return [...byKey.values()];
}

/**
 * Seed/refresh the catalogue (idempotent). Products get the blurb/description/specs;
 * each product gets its size×colour variants — the FIRST is the default and keeps
 * the legacy product key as its sku for back-compat. Each printable variant gets a
 * print template sized to its size.
 */
export async function seedCatalogue(db: DbHandle): Promise<{ products: number; variants: number }> {
  const keys = Object.keys(DEFS);
  let sortOrder = 0;
  let variantCount = 0;

  for (const key of keys) {
    const def = DEFS[key]!;
    const [product] = await db
      .insert(products)
      .values({ key, category: def.category, label: def.label, blurb: def.blurb, description: def.description, specs: def.specs, active: true, sortOrder: sortOrder++ })
      .onConflictDoUpdate({ target: products.key, set: { category: def.category, label: def.label, blurb: def.blurb, description: def.description, specs: def.specs, active: true } })
      .returning();

    const colours = def.colours ?? [undefined];
    let vsort = 0;
    let isFirst = true;
    for (const sizeCode of Object.keys(def.sizes)) {
      const size = def.sizes[sizeCode]!;
      for (const colour of colours) {
        const isDefault = isFirst;
        isFirst = false;
        const sku = variantSku(key, sizeCode, colour, isDefault);
        const attributes: Record<string, string> = {};
        if (size.label !== 'one size') attributes.size = size.label;
        if (colour) attributes.colour = colour;
        const vlabel = [def.label, size.label !== 'one size' ? size.label : null, colour].filter(Boolean).join(' · ');

        const [variant] = await db
          .insert(productVariants)
          .values({ productId: product!.id, sku, label: vlabel, attributes, pricePence: size.pricePence, isDefault, sortOrder: vsort++ })
          .onConflictDoUpdate({ target: productVariants.sku, set: { productId: product!.id, label: vlabel, attributes, pricePence: size.pricePence, isDefault, sortOrder: vsort } })
          .returning();
        variantCount++;

        if (def.print) {
          const dpi = size.dpi ?? 300;
          const wPx = mmToPx(size.wMm, dpi);
          const hPx = mmToPx(size.hMm, dpi);
          const tpl = {
            orientation: (size.wMm > size.hMm ? 'LANDSCAPE' : size.wMm < size.hMm ? 'PORTRAIT' : 'SQUARE') as 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE',
            printWidthMm: size.wMm, printHeightMm: size.hMm, requiredDpi: dpi, printWidthPx: wPx, printHeightPx: hPx,
            aspectMilli: Math.round((size.wMm / size.hMm) * 1000), minSourceWidthPx: wPx, minSourceHeightPx: hPx,
          };
          await db.insert(printTemplates).values({ variantId: variant!.id, ...tpl }).onConflictDoUpdate({ target: printTemplates.variantId, set: tpl });
        }
        await db
          .insert(productVariantProviders)
          .values({ variantId: variant!.id, provider: 'PRODIGI', providerSku: `PRODIGI-PLACEHOLDER-${sku}`, isDefault: true })
          .onConflictDoNothing();
      }
    }
  }
  return { products: keys.length, variants: variantCount };
}

/** Resolve a basket-line key (a product key → its default variant, or a variant sku)
 * to the variant id. Used by order placement so both quick-adds and customised
 * lines land on a real variant. */
export async function resolveVariantIdsByKey(db: DbHandle, keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({ id: productVariants.id, sku: productVariants.sku, productKey: products.key, isDefault: productVariants.isDefault })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(or(inArray(productVariants.sku, keys), inArray(products.key, keys)));
  const byKey = new Map<string, string>();
  for (const r of rows) {
    byKey.set(r.sku, r.id);
    if (r.isDefault) byKey.set(r.productKey, r.id);
  }
  return byKey;
}
