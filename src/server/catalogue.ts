import 'server-only';
import { and, asc, eq, inArray, ne, notInArray, or } from 'drizzle-orm';
import { printTemplates, productVariantProviders, productVariants, products } from '@/db/schema';
import { CATALOGUE, type PricedCatalogue } from '@/pricing';
import { mmToPx } from './print/geometry';
import type { DbHandle } from './db';

export { mmToPx };

// ── Variant catalogue, mapped to REAL Prodigi SKUs (D4) ──────────────────────
// Each variant carries the live, sandbox-validated Prodigi SKU it's fulfilled by
// plus the Prodigi `attributes` to send at order time (size/colour when Prodigi
// models them as attributes of one SKU rather than separate SKUs). The brand voice
// (label/blurb/description) is OURS; the technical `specs` here are placeholders
// the Prodigi catalogue sync overwrites with real values. Prices are our retail
// pence (server-authoritative); Prodigi cost is a separate quote concern.
type VariantDef = {
  size?: string; // display size, e.g. 'A4', '11oz', '30 pieces'; omit for one-size
  colour?: string; // display colour
  pricePence: number;
  wMm: number;
  hMm: number;
  dpi?: number;
  prodigiSku?: string; // the live Prodigi SKU (absent ⇒ MANUAL-fulfilled, e.g. add-ons)
  prodigiAttrs?: Record<string, string>; // attributes to send to Prodigi at order time
};
type ProductDef = {
  category: 'PRINT' | 'MUG' | 'APPAREL' | 'CUSHION' | 'BLANKET' | 'BOOK' | 'PUZZLE' | 'BAG' | 'CARD' | 'ADDON';
  label: string;
  blurb: string;
  description: string;
  specs: Record<string, string>;
  print: boolean;
  variants: VariantDef[]; // the FIRST is the default
};

// Frame: colour is a Prodigi *attribute* of one SKU per size → many of our variants
// share a SKU. "framed in gold" is the brand signature, so gold is offered.
const FRAME_COLOURS = ['natural', 'black', 'white', 'gold'];
const FRAME_SIZES = [
  { size: 'A4', sku: 'GLOBAL-CFPM-A4', wMm: 210, hMm: 297, pricePence: 2200 },
  { size: 'A3', sku: 'GLOBAL-CFPM-A3', wMm: 297, hMm: 420, pricePence: 3200 },
] as const;
function frameVariants(): VariantDef[] {
  return FRAME_SIZES.flatMap((s) =>
    FRAME_COLOURS.map((colour) => ({
      size: s.size, colour, pricePence: s.pricePence, wMm: s.wMm, hMm: s.hMm,
      prodigiSku: s.sku, prodigiAttrs: { color: colour },
    })),
  );
}

// Kids tee: Stanley/Stella Mini Creator — size AND colour are Prodigi attributes of
// ONE SKU. Values are the exact Prodigi attribute strings (so orders are accurate).
const TEE_SIZES = ['3-4 years', '5-6 years', '7-8 years'];
const TEE_COLOURS = ['white', 'caribbean blue', 'cotton pink'];
function teeVariants(): VariantDef[] {
  return TEE_SIZES.flatMap((size) =>
    TEE_COLOURS.map((colour) => ({
      size, colour, pricePence: 1800, wMm: 240, hMm: 300,
      prodigiSku: 'TEE-SS-STTK909', prodigiAttrs: { size, color: colour },
    })),
  );
}

const DEFS: Record<string, ProductDef> = {
  card: {
    category: 'CARD', label: 'card', blurb: 'a little card, a big smile', print: true,
    description: "A folded greeting card with your little one's artwork on the front — ready to write in and give.",
    specs: { material: '330gsm card', inside: 'blank for your message' },
    variants: [
      { size: '7×5″', pricePence: 400, wMm: 127, hMm: 178, prodigiSku: 'CLASSIC-GRE-FEDR-7X5-BLA' },
      { size: 'A5', pricePence: 450, wMm: 148, hMm: 210, prodigiSku: 'CLASSIC-GRE-FEDR-A5-BLA' },
    ],
  },
  framedPrint: {
    category: 'PRINT', label: 'framed print', blurb: 'made real, framed in gold', print: true,
    description: 'A gallery-quality print of the original, framed and ready to hang — the wonky bits framed in gold.',
    specs: { material: 'fine-art paper', glazing: 'shatterproof Perspex' },
    variants: frameVariants(),
  },
  mug: {
    category: 'MUG', label: 'mug', blurb: 'a morning cuppa, made magic', print: true,
    description: "Their masterpiece wrapped around a sturdy mug — for the grown-up who'll treasure every sip.",
    specs: { material: 'ceramic', care: 'dishwasher safe' },
    variants: [
      { size: '11oz', colour: 'white', pricePence: 1400, wMm: 200, hMm: 85, prodigiSku: 'H-MUG-W' },
      { size: '11oz', colour: 'pink', pricePence: 1400, wMm: 200, hMm: 85, prodigiSku: 'H-MUG-11OZ-PNK' },
      { size: '11oz', colour: 'blue', pricePence: 1400, wMm: 200, hMm: 85, prodigiSku: 'H-MUG-11OZ-BLU' },
      { size: '15oz', colour: 'white', pricePence: 1800, wMm: 220, hMm: 95, prodigiSku: 'H-MUG-15OZ-W' },
    ],
  },
  kidsTee: {
    category: 'APPAREL', label: 'kids tee', blurb: 'their masterpiece, worn with pride', print: true,
    description: 'A soft organic-cotton tee with their own drawing printed on the front — made to be worn (and washed) again and again.',
    specs: { care: 'wash at 30°' },
    variants: teeVariants(),
  },
  cushion: {
    category: 'CUSHION', label: 'cushion', blurb: 'a squishy keepsake for the sofa', print: true,
    description: 'A plump cushion with their artwork on it — a keepsake you can actually hug.',
    specs: { material: 'canvas, double-sided', filling: 'fibre fill included' },
    variants: [
      { size: '16″', pricePence: 2800, wMm: 406, hMm: 406, prodigiSku: 'GLOBAL-CUSH-16X16-CAN-DUAL' },
      { size: '20″', pricePence: 3400, wMm: 508, hMm: 508, prodigiSku: 'GLOBAL-CUSH-20X20-CAN-DUAL' },
    ],
  },
  blanket: {
    category: 'BLANKET', label: 'blanket', blurb: 'cuddles, with their art woven in', print: true,
    description: 'A cosy fleece blanket carrying their drawing — for snuggles that last long after they grow.',
    specs: { material: 'fleece', care: 'machine washable' },
    variants: [
      { size: 'medium', colour: 'white', pricePence: 4500, wMm: 600, hMm: 1000, dpi: 150, prodigiSku: 'H-BLA-PBMWHITE' },
      { size: 'medium', colour: 'pink', pricePence: 4500, wMm: 600, hMm: 1000, dpi: 150, prodigiSku: 'H-BLA-PBMPINK' },
      { size: 'large', colour: 'white', pricePence: 6000, wMm: 1000, hMm: 1500, dpi: 150, prodigiSku: 'H-BLA-PBLWHITE' },
      { size: 'large', colour: 'pink', pricePence: 6000, wMm: 1000, hMm: 1500, dpi: 150, prodigiSku: 'H-BLA-PBLPINK' },
    ],
  },
  storybook: {
    category: 'BOOK', label: 'storybook', blurb: "they're the hero of the story", print: true,
    description: 'A keepsake hardcover book starring your little one and their artwork — the tale they were always the hero of.',
    specs: { material: 'hardcover', pages: '24 pages' },
    variants: [{ size: 'A4', pricePence: 2400, wMm: 210, hMm: 297, prodigiSku: 'BOOK-FE-A4-P-HARD-G' }],
  },
  jigsaw: {
    category: 'PUZZLE', label: 'jigsaw', blurb: 'piece their masterpiece together', print: true,
    description: 'Their drawing turned into a jigsaw in a keepsake tin — rainy-afternoon magic, piece by piece.',
    specs: { material: 'board, in a keepsake tin' },
    variants: [
      { size: '30 pieces', pricePence: 2000, wMm: 250, hMm: 200, prodigiSku: 'JIGSAW-PUZZLE-30' },
      { size: '110 pieces', pricePence: 2600, wMm: 250, hMm: 200, prodigiSku: 'JIGSAW-PUZZLE-110' },
      { size: '252 pieces', pricePence: 3200, wMm: 375, hMm: 285, prodigiSku: 'JIGSAW-PUZZLE-252' },
    ],
  },
  toteBag: {
    category: 'BAG', label: 'tote bag', blurb: 'carry their creativity everywhere', print: true,
    description: 'A roomy canvas tote with their artwork printed on — creativity you can carry to the shops.',
    specs: { material: 'canvas', handles: 'black' },
    variants: [{ size: '14×18.5″', pricePence: 1600, wMm: 350, hMm: 400, prodigiSku: 'H-BAG-CTB' }],
  },
  giftWrap: {
    category: 'ADDON', label: 'gift wrap', blurb: 'a handwritten-style note + wrap', print: false,
    description: "We'll wrap it beautifully and tuck in a handwritten-style note.",
    specs: {},
    variants: [{ pricePence: 300, wMm: 0, hMm: 0 }], // no Prodigi SKU ⇒ MANUAL
  },
};

// Curated "Most Popular" front-of-shop order (by product key). Anything NOT listed
// lives only in the Full Catalogue — so the founder's incoming big list defaults to
// full-catalogue-only until promoted here. Founder-curated for now; ready to be
// driven by real order counts later. Order in this array = the popular rank.
const POPULAR_ORDER = ['framedPrint', 'mug', 'kidsTee', 'cushion', 'card', 'blanket', 'jigsaw', 'storybook', 'toteBag'];
function popularRankOf(key: string): number | null {
  const i = POPULAR_ORDER.indexOf(key);
  return i === -1 ? null : i + 1;
}

/** A short, stable code for a variant's size/colour, used in its internal sku. */
function slug(s: string | undefined): string | null {
  if (!s) return null;
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Stable sku for a variant: the default keeps the legacy product key (back-compat). */
function variantSku(productKey: string, v: VariantDef, isDefault: boolean): string {
  if (isDefault) return productKey;
  return [productKey, slug(v.size), slug(v.colour)].filter(Boolean).join('-');
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
  /** Curated front-of-shop rank (1 = first). null ⇒ Full-Catalogue-only. */
  popularRank: number | null;
}

/** Every active product with its variants — for the catalogue + customise screens. */
export async function loadCatalogue(db: DbHandle): Promise<CatalogueProduct[]> {
  const rows = await db
    .select({
      key: products.key, label: products.label, blurb: products.blurb, description: products.description, specs: products.specs, category: products.category, sortOrder: products.sortOrder, popularRank: products.popularRank,
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
      p = { key: r.key, label: r.label, blurb: r.blurb, description: r.description, specs: (r.specs as Record<string, string>) ?? {}, category: r.category, fromPence: r.vPrice, sizes: [], colours: [], variants: [], popularRank: r.popularRank ?? null };
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
 * each product gets its explicit variants — the FIRST is the default and keeps the
 * legacy product key as its sku for back-compat. Each printable variant gets a print
 * template, and exactly one provider row: PRODIGI (with the live SKU + the order-time
 * attributes) or MANUAL when no Prodigi SKU is mapped (e.g. add-ons). Variants no
 * longer in the DEFS are DEACTIVATED (kept for order history, hidden from the shop).
 * The Prodigi catalogue sync then validates each SKU + enriches the specs.
 */
export async function seedCatalogue(db: DbHandle): Promise<{ products: number; variants: number }> {
  const keys = Object.keys(DEFS);
  let sortOrder = 0;
  let variantCount = 0;

  for (const key of keys) {
    const def = DEFS[key]!;
    const order = sortOrder++;
    const popularRank = popularRankOf(key);
    const [product] = await db
      .insert(products)
      .values({ key, category: def.category, label: def.label, blurb: def.blurb, description: def.description, specs: def.specs, active: true, sortOrder: order, popularRank })
      .onConflictDoUpdate({ target: products.key, set: { category: def.category, label: def.label, blurb: def.blurb, description: def.description, specs: def.specs, active: true, sortOrder: order, popularRank } })
      .returning();

    const currentSkus = def.variants.map((v, i) => variantSku(key, v, i === 0));

    let vsort = 0;
    for (const v of def.variants) {
      const isDefault = vsort === 0;
      const sku = variantSku(key, v, isDefault);
      const attributes: Record<string, string> = {};
      if (v.size) attributes.size = v.size;
      if (v.colour) attributes.colour = v.colour;
      const vlabel = [def.label, v.size, v.colour].filter(Boolean).join(' · ');

      const [variant] = await db
        .insert(productVariants)
        .values({ productId: product!.id, sku, label: vlabel, attributes, pricePence: v.pricePence, isDefault, sortOrder: vsort, active: true })
        .onConflictDoUpdate({ target: productVariants.sku, set: { productId: product!.id, label: vlabel, attributes, pricePence: v.pricePence, isDefault, sortOrder: vsort, active: true } })
        .returning();
      vsort++;
      variantCount++;

      if (def.print) {
        const dpi = v.dpi ?? 300;
        const wPx = mmToPx(v.wMm, dpi);
        const hPx = mmToPx(v.hMm, dpi);
        const tpl = {
          orientation: (v.wMm > v.hMm ? 'LANDSCAPE' : v.wMm < v.hMm ? 'PORTRAIT' : 'SQUARE') as 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE',
          printWidthMm: v.wMm, printHeightMm: v.hMm, requiredDpi: dpi, printWidthPx: wPx, printHeightPx: hPx,
          aspectMilli: Math.round((v.wMm / v.hMm) * 1000), minSourceWidthPx: wPx, minSourceHeightPx: hPx,
        };
        await db.insert(printTemplates).values({ variantId: variant!.id, ...tpl }).onConflictDoUpdate({ target: printTemplates.variantId, set: tpl });
      }

      // Exactly one provider row per variant: Prodigi when a live SKU is mapped (the
      // order-time attributes go in providerConfig), else MANUAL. Concurrency-safe
      // (the int suite seeds in parallel): drop any wrong-provider row (e.g. an old
      // placeholder), then upsert the correct one.
      const provider = v.prodigiSku ? 'PRODIGI' : 'MANUAL';
      const providerSku = v.prodigiSku ?? sku;
      const providerConfig = v.prodigiAttrs ? { prodigiAttrs: v.prodigiAttrs } : null;
      await db
        .delete(productVariantProviders)
        .where(and(eq(productVariantProviders.variantId, variant!.id), ne(productVariantProviders.provider, provider)));
      await db
        .insert(productVariantProviders)
        .values({ variantId: variant!.id, provider, providerSku, providerConfig, isDefault: true })
        .onConflictDoUpdate({
          target: [productVariantProviders.variantId, productVariantProviders.provider],
          set: { providerSku, providerConfig, isDefault: true, active: true },
        });
    }

    // Hide any variant of this product no longer in the DEFS (e.g. an old colour).
    await db
      .update(productVariants)
      .set({ active: false })
      .where(and(eq(productVariants.productId, product!.id), notInArray(productVariants.sku, currentSkus)));
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
