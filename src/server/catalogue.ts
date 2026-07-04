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
  default?: boolean; // mark the default variant when it isn't the first (e.g. size M of XS–2XL)
};
type ProductDef = {
  category: 'PRINT' | 'MUG' | 'APPAREL' | 'CUSHION' | 'BLANKET' | 'BOOK' | 'PUZZLE' | 'BAG' | 'CARD' | 'FESTIVE' | 'ADDON';
  label: string;
  blurb: string;
  description: string;
  specs: Record<string, string>;
  print: boolean;
  variants: VariantDef[]; // the FIRST is the default unless one sets `default: true`
};

// Framed print: 5 sizes; frame colour is a Prodigi *attribute* of one SKU per size, so the
// colours share a SKU. "framed in gold" is the brand signature → gold leads (and is the default).
// Prices are the founder-approved retail (free delivery baked in). Large sizes drop to 150dpi.
const FRAME_COLOURS = ['gold', 'black', 'white', 'natural'];
const FRAME_SIZES = [
  { size: '11×14″', sku: 'GLOBAL-CFP-11X14', wMm: 279, hMm: 356, dpi: 300, pricePence: 6695 },
  { size: '12×16″', sku: 'GLOBAL-CFP-12X16', wMm: 305, hMm: 406, dpi: 300, pricePence: 6995 },
  { size: '18×24″', sku: 'GLOBAL-CFP-18X24', wMm: 457, hMm: 610, dpi: 150, pricePence: 8995 },
  { size: '24×32″', sku: 'GLOBAL-CFP-24X32', wMm: 610, hMm: 813, dpi: 150, pricePence: 10995 },
  { size: '28×40″', sku: 'GLOBAL-CFP-28X40', wMm: 711, hMm: 1016, dpi: 150, pricePence: 13995 },
] as const;
function frameVariants(): VariantDef[] {
  return FRAME_SIZES.flatMap((s) =>
    FRAME_COLOURS.map((colour) => ({
      size: s.size, colour, pricePence: s.pricePence, wMm: s.wMm, hMm: s.hMm, dpi: s.dpi,
      prodigiSku: s.sku, prodigiAttrs: { color: colour },
    })),
  );
}

// Mug: the tracked two-tone 11oz range (white body + coloured rim/handle) — each colour is its
// OWN Prodigi SKU — plus a 15oz white. White leads (default).
const MUG_TWOTONE = [
  { colour: 'white', sku: 'H-MUG-11OZ-W' }, { colour: 'black', sku: 'H-MUG-11OZ-WB' },
  { colour: 'blue', sku: 'H-MUG-11OZ-WBL' }, { colour: 'green', sku: 'H-MUG-11OZ-WG' },
  { colour: 'orange', sku: 'H-MUG-11OZ-WO' }, { colour: 'pink', sku: 'H-MUG-11OZ-WP' },
  { colour: 'red', sku: 'H-MUG-11OZ-WR' }, { colour: 'yellow', sku: 'H-MUG-11OZ-WY' },
] as const;
function mugVariants(): VariantDef[] {
  // Print canvases from Prodigi's OFFICIAL templates (11oz: 2473×1157px @300dpi = 209×98mm;
  // 15oz: 2563×1157px = 217×98mm) — the wrap the print file must fill.
  return [
    ...MUG_TWOTONE.map((m) => ({ size: '11oz', colour: m.colour, pricePence: 1795, wMm: 209, hMm: 98, prodigiSku: m.sku })),
    { size: '15oz', colour: 'white', pricePence: 2295, wMm: 217, hMm: 98, prodigiSku: 'H-MUG-15OZ-W' },
  ];
}

// Kids tee: Stanley/Stella Mini Creator — size AND colour are Prodigi attributes of ONE SKU.
// Values are the exact Prodigi attribute strings. White is the cheaper tier; colours a touch more.
const KTEE_SIZES = ['3-4 years', '5-6 years', '7-8 years', '9-11 years', '12-14 years'];
const KTEE_COLOURS = [
  { colour: 'white', attr: 'white', pricePence: 2495 },
  { colour: 'blue', attr: 'caribbean blue', pricePence: 2695 },
  { colour: 'pink', attr: 'cotton pink', pricePence: 2695 },
];
function kidsTeeVariants(): VariantDef[] {
  return KTEE_SIZES.flatMap((size) =>
    KTEE_COLOURS.map((c) => ({
      size, colour: c.colour, pricePence: c.pricePence, wMm: 240, hMm: 300, dpi: 150,
      prodigiSku: 'TEE-SS-STTK909', prodigiAttrs: { size, color: c.attr },
    })),
  );
}

// Adult tee: Stanley/Stella Sparker 2.0 (STTU171) — a UNISEX organic heavy tee, the grown-up
// sibling of the kids' Mini Creator. ONE SKU for everyone (the Bella+Canvas womens tee was
// dropped 2026-07-03: not organic, and unisex S/S keeps the family matching set in one garment
// family). Size is a Prodigi attribute; £12 flat cost across XS–2XL, GB-fulfilled, tracked.
function adultTeeVariants(): VariantDef[] {
  return ['XS', 'S', 'M', 'L', 'XL', '2XL'].map((s) => ({
    size: s, colour: 'white', pricePence: 3195, wMm: 300, hMm: 360, dpi: 150,
    prodigiSku: 'TEE-SS-STTM559', prodigiAttrs: { size: s.toLowerCase(), color: 'white' },
    default: s === 'M', // sizes display XS→2XL; M is the sane default
  }));
}

// Baby bodysuit: Rabbit Skins LONG-sleeve 4411. The short-sleeve 4424 is GB-fulfilled only in
// colours — its WHITE ships from Canada/Australia (5–21 days, and a child's image routed to a
// non-UK/EU lab fails our residency posture). White 4411 is GB-made, £9, next-day. Tracked
// shipping for a bodysuit-ALONE order is Express-only — flagged to the founder; in a family-set
// order the garments ship together tracked.
function babyVariants(): VariantDef[] {
  return ['newborn', '6-12 months', '12-18 months', '18-24 months'].map((size) => ({
    size, colour: 'white', pricePence: 2195, wMm: 180, hMm: 200, dpi: 150,
    prodigiSku: 'GLOBAL-BB-RS-4411', prodigiAttrs: { size, color: 'white' },
  }));
}

// Fleece blanket: each size+colour is its own Prodigi SKU.
function blanketVariants(): VariantDef[] {
  return [
    { size: 'medium', colour: 'white', pricePence: 5795, wMm: 600, hMm: 1000, dpi: 150, prodigiSku: 'H-BLA-PBMWHITE' },
    { size: 'medium', colour: 'pink', pricePence: 6495, wMm: 600, hMm: 1000, dpi: 150, prodigiSku: 'H-BLA-PBMPINK' },
    { size: 'medium', colour: 'blue', pricePence: 6495, wMm: 600, hMm: 1000, dpi: 150, prodigiSku: 'H-BLA-PBMBLUE' },
    { size: 'large', colour: 'white', pricePence: 7595, wMm: 1000, hMm: 1500, dpi: 150, prodigiSku: 'H-BLA-PBLWHITE' },
    { size: 'large', colour: 'pink', pricePence: 7595, wMm: 1000, hMm: 1500, dpi: 150, prodigiSku: 'H-BLA-PBLPINK' },
  ];
}

// The founder-approved launch range (2026-07-01). Prices are our retail pence, VAT-inclusive with
// FREE tracked delivery baked in (the shipping cost is inside the price, no separate line). Every
// SKU is GB-fulfilled by Prodigi. See project-office/briefs/PRICING.md + the pricing Sheet.
const DEFS: Record<string, ProductDef> = {
  framedPrint: {
    category: 'PRINT', label: 'framed print', blurb: 'made real, framed in gold', print: true,
    description: 'A gallery-quality print of the original, framed and ready to hang — the wonky bits framed in gold.',
    specs: { material: 'fine-art paper', glazing: 'shatterproof' },
    variants: frameVariants(),
  },
  mug: {
    category: 'MUG', label: 'mug', blurb: 'a morning cuppa, made magic', print: true,
    description: "Their masterpiece wrapped around a sturdy two-tone mug — for the grown-up who'll treasure every sip.",
    specs: { material: 'ceramic', care: 'dishwasher safe' },
    variants: mugVariants(),
  },
  cushion: {
    category: 'CUSHION', label: 'cushion', blurb: 'a squishy keepsake for the sofa', print: true,
    description: 'A plump cushion with their artwork on it — heart, round or square, a keepsake you can actually hug.',
    specs: { material: 'faux suede / linen', filling: 'fibre fill included' },
    variants: [
      { size: 'heart', pricePence: 2295, wMm: 280, hMm: 280, dpi: 150, prodigiSku: 'GLOBAL-CUSH-SH-SCSSS' },
      { size: '18″ round', pricePence: 2995, wMm: 457, hMm: 457, dpi: 150, prodigiSku: 'GLOBAL-CUSH-18R-SCSSS' },
      { size: '12″ square', pricePence: 3250, wMm: 305, hMm: 305, dpi: 150, prodigiSku: 'GLOBAL-CUSH-12X12-LIN-DUAL' },
      { size: '22″ square', pricePence: 4250, wMm: 559, hMm: 559, dpi: 150, prodigiSku: 'GLOBAL-CUSH-22X22-SUE-DUAL' },
    ],
  },
  storybook: {
    category: 'BOOK', label: 'storybook', blurb: "they're the hero of the story", print: true,
    description: 'A keepsake hardcover book starring your little one and their artwork — the tale they were always the hero of.',
    specs: { material: 'hardcover, gloss', pages: '24 pages' },
    variants: [
      { size: 'A5', pricePence: 2595, wMm: 148, hMm: 210, dpi: 300, prodigiSku: 'BOOK-FE-A5-P-HARD-G' },
      { size: 'A4', pricePence: 2895, wMm: 210, hMm: 297, dpi: 300, prodigiSku: 'BOOK-FE-A4-P-HARD-G' },
    ],
  },
  kidsTee: {
    category: 'APPAREL', label: 'kids tee', blurb: 'their masterpiece, worn with pride', print: true,
    description: 'A soft organic-cotton tee with their own drawing printed on the front — made to be worn (and washed) again and again.',
    specs: { material: 'organic cotton', care: 'wash at 30°' },
    variants: kidsTeeVariants(),
  },
  jigsaw: {
    category: 'PUZZLE', label: 'jigsaw', blurb: 'piece their masterpiece together', print: true,
    description: 'Their drawing turned into a jigsaw in a keepsake tin — rainy-afternoon magic, piece by piece.',
    specs: { material: 'board, in a keepsake tin', delivery: 'tracked' },
    variants: [
      { size: '30 pieces', pricePence: 2795, wMm: 250, hMm: 200, dpi: 300, prodigiSku: 'JIGSAW-PUZZLE-30' },
      { size: '110 pieces', pricePence: 3250, wMm: 250, hMm: 200, dpi: 300, prodigiSku: 'JIGSAW-PUZZLE-110' },
      { size: '252 pieces', pricePence: 3495, wMm: 375, hMm: 285, dpi: 300, prodigiSku: 'JIGSAW-PUZZLE-252' },
    ],
  },
  blanket: {
    category: 'BLANKET', label: 'fleece blanket', blurb: 'cuddles, with their art woven in', print: true,
    description: 'A cosy fleece blanket carrying their drawing — for snuggles that last long after they grow.',
    specs: { material: 'fleece', care: 'machine washable' },
    variants: blanketVariants(),
  },
  babyBodysuit: {
    category: 'APPAREL', label: 'baby bodysuit', blurb: 'their first masterpiece, worn tiny', print: true,
    description: "A soft long-sleeved cotton bodysuit with their drawing on the front — for the littlest artist, while they're still this little.",
    specs: { material: 'fine jersey cotton', sleeves: 'long', care: 'machine washable' },
    variants: babyVariants(),
  },
  card: {
    category: 'CARD', label: 'greetings card', blurb: 'a little card, a big smile', print: true,
    description: "A folded greetings card with your little one's artwork on the front — ready to write in and give.",
    specs: { material: '350gsm card', inside: 'blank for your message' },
    variants: [
      { size: '7×5″', pricePence: 495, wMm: 127, hMm: 178, dpi: 300, prodigiSku: 'GLOBAL-GRE-GLOS-7X5-BLA' },
      { size: '7×5″ premium', pricePence: 575, wMm: 127, hMm: 178, dpi: 300, prodigiSku: 'GLOBAL-GRE-MOH-7X5-BLA' },
    ],
  },
  calendar: {
    category: 'PRINT', label: 'calendar', blurb: 'a year of their masterpieces', print: true,
    description: 'A wall calendar carrying a year of their drawings — a new little masterpiece to smile at every month.',
    specs: { material: 'silk 300gsm', format: 'landscape wall calendar' },
    variants: [
      { size: 'A5', pricePence: 1895, wMm: 210, hMm: 148, dpi: 300, prodigiSku: 'CALENDAR-A5-L-UNDATED' },
      { size: 'A4', pricePence: 2095, wMm: 297, hMm: 210, dpi: 300, prodigiSku: 'CALENDAR-A4-L-UNDATED' },
    ],
  },
  adultTee: {
    category: 'APPAREL', label: 'adult tee', blurb: 'worn by their biggest fan', print: true,
    description: "The grown-up version of the kids tee — the same organic cotton, sized up, with your little one's artwork on the front. A relaxed unisex fit for mums, dads and anyone in their fan club.",
    specs: { material: 'organic cotton', fit: 'unisex, XS–2XL', care: 'wash at 30°' },
    variants: adultTeeVariants(),
  },
  apron: {
    category: 'APPAREL', label: 'apron', blurb: 'little chef, big mess, kept forever', print: true,
    description: 'A wipe-clean apron with their artwork on it — for baking days, painting days, and every happy mess.',
    specs: { material: 'poly-cotton', ties: 'black' },
    variants: [
      { size: 'child', pricePence: 2495, wMm: 220, hMm: 280, dpi: 150, prodigiSku: 'H-APR-CA-BTIE' },
      { size: 'adult', pricePence: 2895, wMm: 300, hMm: 360, dpi: 150, prodigiSku: 'H-APR-AA-BTIE' },
    ],
  },
  bauble: {
    category: 'FESTIVE', label: 'ceramic bauble', blurb: 'a little masterpiece for the tree', print: true,
    description: "A ceramic bauble carrying their drawing — the ornament you'll unwrap and smile at every Christmas.",
    specs: { material: 'ceramic', size: '3″' },
    // 82×82mm = Prodigi's official template canvas (968×968px @300dpi) for the 3″ face.
    variants: [{ size: '3″', pricePence: 2095, wMm: 82, hMm: 82, dpi: 300, prodigiSku: 'XMAS-PORC-BAUB' }],
  },
  sack: {
    category: 'FESTIVE', label: 'christmas sack', blurb: 'where the magic waits on christmas eve', print: true,
    description: 'A cotton Christmas sack with their artwork on it — filled on Christmas Eve, treasured for years after.',
    specs: { material: 'cotton', size: '19×30″' },
    // 320×500mm = Prodigi's official print panel (3780×5907px @300dpi), NOT the whole sack.
    variants: [{ size: 'one size', pricePence: 3495, wMm: 320, hMm: 500, dpi: 150, prodigiSku: 'XMAS-SACK' }],
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
const POPULAR_ORDER = ['framedPrint', 'storybook', 'cushion', 'mug', 'jigsaw', 'kidsTee', 'blanket', 'babyBodysuit', 'card'];
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

    const defaultIndex = Math.max(0, def.variants.findIndex((v) => v.default));
    const currentSkus = def.variants.map((v, i) => variantSku(key, v, i === defaultIndex));

    let vsort = 0;
    for (const v of def.variants) {
      const isDefault = vsort === defaultIndex;
      // A printable product without a POD SKU would seed as MANUAL and silently never
      // fulfil — that's an authoring mistake, not a configuration.
      if (def.print && !v.prodigiSku) {
        console.warn(`[seed-catalogue] printable variant ${key}/${v.size ?? ''}/${v.colour ?? ''} has NO prodigiSku — it will be MANUAL-fulfilled`);
      }
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

  // Retire any whole product no longer in the DEFS (e.g. the discontinued tote bag) so removing a
  // line from the catalogue actually takes it off the shelf — and clear its popular rank so it
  // can't collide with a live product's rank. Cascade to its variants so none linger active.
  await db.update(products).set({ active: false, popularRank: null }).where(notInArray(products.key, keys));
  await db
    .update(productVariants)
    .set({ active: false })
    .where(inArray(productVariants.productId, db.select({ id: products.id }).from(products).where(notInArray(products.key, keys))));

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
