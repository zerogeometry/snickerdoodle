import 'server-only';
import { and, asc, eq, inArray, ne, notInArray, or, sql } from 'drizzle-orm';
import { printTemplates, productVariantProviders, productVariants, products } from '@/db/schema';
import { CATALOGUE, economicsOf, multiBuyTiers, parcelGroupOf, type PricedCatalogue } from '@/pricing';
import { mmToPx, templateGeom, type TemplateGeom } from './print/geometry';
import type { DbHandle } from './db';
import { EXPECTED_POPULARITY, recomputePopularity } from './popularity';
import {
  ADULT_HOODIE_COLOURS, ADULT_HOODIE_SIZES, ADULT_TEE_COLOURS, ADULT_TEE_SIZES, KIDS_HOODIE_COLOURS, KIDS_HOODIE_SIZES,
  KIDS_TEE_COLOURS, KIDS_TEE_SIZES, type GarmentColour,
  ADULT_JUMPER_COLOURS, ADULT_JUMPER_SIZES, KIDS_JUMPER_COLOURS, KIDS_JUMPER_SIZES,
} from '@/lib/garments';
import { CASE_FINISHES, CASE_GRADES, CASE_PRICE_PENCE, PHONE_MODELS, prodigiCaseSku } from '@/lib/phone-cases';
import { BUNDLE_ONLY_SKUS, BUNDLE_SIZES, isBundleKey } from '@/lib/christmas-bundle';

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
  orientation?: 'portrait' | 'landscape'; // frames: how it hangs (landscape = swapped canvas)
  sides?: 'single' | 'double'; // cushions: 'double' = the DUAL SKU (one double-wide front|back print file)
  pricePence: number;
  wMm: number;
  hMm: number;
  dpi?: number;
  prodigiSku?: string; // the live Prodigi SKU (absent ⇒ MANUAL-fulfilled, e.g. add-ons)
  prodigiAttrs?: Record<string, string>; // attributes to send to Prodigi at order time
  /** Prodigi print areas the print file fills (default ['default']). Garments print to 'front';
   * a jigsaw needs BOTH 'jigsaw' and its tin 'lid'. Frozen onto every order with the spec. */
  printTo?: string[];
  default?: boolean; // mark the default variant when it isn't the first (e.g. size M of XS–2XL)
  /** Trim margin around the print (default 3mm). Garments have NO trim — the file IS the print area. */
  bleedMm?: number;
  /** Phone cases: the grade (snap | tough) and the finish (gloss | matte). `size` is the phone model. */
  grade?: string;
  finish?: string;
  /** Prodigi's EXACT print-file pixels, when we have them (phone cases) — the template uses these
   * rather than rounding from mm, so the file is exactly what Prodigi asks for. */
  px?: { w: number; h: number };
  /** Judge the print's QUALITY at this dpi, when it's lower than the file's (`dpi`): a print Prodigi
   * asks for at 300 dpi that looks right at 150 where it's seen. Seeded as the template's
   * minSourceWidthPx/HeightPx (geometry.ts templateGeom → gateDpi). Absent ⇒ judged at `dpi`. */
  gateDpi?: number;
};
type ProductDef = {
  category: 'PRINT' | 'MUG' | 'APPAREL' | 'CUSHION' | 'BLANKET' | 'BOOK' | 'PUZZLE' | 'BAG' | 'CARD' | 'FESTIVE' | 'ADDON' | 'TECH';
  label: string;
  blurb: string;
  description: string;
  specs: Record<string, string>;
  print: boolean;
  /** STOREFRONT curation (founder, 2026-07-07): on show only when the whole product
   * experience is "bang on" — launch is the framed print alone. Display-only; the
   * product stays active/priceable/workable in the backend and graduates by flipping
   * this + reseeding. */
  visibleInShop?: boolean;
  /** Not on sale at all right now (founder, 2026-10-13: no card / gift-wrap add-ons for now).
   * Seeded INACTIVE, so it can't be priced or ordered — not just hidden. */
  paused?: boolean;
  variants: VariantDef[]; // the FIRST is the default unless one sets `default: true`
};

// Framed print: 5 sizes; frame colour is a Prodigi *attribute* of one SKU per size, so the
// colours share a SKU. "framed in gold" is the brand signature → gold leads (and is the default).
// Prices are the founder-approved retail (free delivery baked in). The large sizes are made at
// Prodigi's own 300dpi size (printAreaSizes 5400×7200 / 7200×9600px, sandbox 27 Oct) but still JUDGED
// at 150dpi (gateDpi) — the bar they always had, so no drawing that printed before is refused now.
// The full Prodigi classic-frame colour range (founder call 2026-07-07: sell all eight).
// Colour strings are Prodigi's exact `color` attribute values.
const FRAME_COLOURS = ['gold', 'black', 'white', 'natural', 'brown', 'dark grey', 'light grey', 'silver'];
// Every size is Prodigi's EXACT printAreaSizes (sandbox, 27 Oct), bleed 0 — Prodigi's area already
// carries its bleed. The 12×16″ black and white frames take a slightly different file from the rest
// (3614×4795 vs 3600×4800) — Prodigi's own data, so they get their own (`colourPx`).
const FRAME_SIZES: Array<{ size: string; sku: string; pricePence: number; colourPx?: Record<string, { w: number; h: number }> } & Canvas> = [
  { size: '11×14″', sku: 'GLOBAL-CFP-11X14', ...exactPx({ w: 3307, h: 4192 }, 300), pricePence: 6500 },
  { size: '12×16″', sku: 'GLOBAL-CFP-12X16', ...exactPx({ w: 3600, h: 4800 }, 300), colourPx: { black: { w: 3614, h: 4795 }, white: { w: 3614, h: 4795 } }, pricePence: 7000 },
  { size: '18×24″', sku: 'GLOBAL-CFP-18X24', ...exactPx({ w: 5400, h: 7200 }, 300), gateDpi: 150, pricePence: 9000 },
  { size: '24×32″', sku: 'GLOBAL-CFP-24X32', ...exactPx({ w: 7200, h: 9600 }, 300), gateDpi: 150, pricePence: 10500 },
  // 28×40″ (GLOBAL-CFP-28X40) withdrawn 2026-10-15: made at Prodigi's NL lab, not GB — the one
  // non-UK item, pricier to post; customs/VAT + delivery time to confirm before it returns.
];
function frameVariants(): VariantDef[] {
  // Orientation is OURS, not Prodigi's: their frame print files are fixed-portrait
  // (printAreaSizes, above), and the frame hangs either
  // way. A landscape variant works natively landscape (swapped canvas) through the
  // preview + positioner; the fulfilment render rotates the finished print file 90°
  // back to Prodigi's portrait spec. Portrait skus keep their existing names.
  return FRAME_SIZES.flatMap((s) =>
    (['portrait', 'landscape'] as const).flatMap((orientation) =>
      FRAME_COLOURS.map((colour) => ({
        size: s.size, colour, orientation,
        pricePence: s.pricePence,
        ...turned(s.colourPx?.[colour] ? { ...s, ...exactPx(s.colourPx[colour], 300) } : s, orientation === 'landscape'),
        prodigiSku: s.sku, prodigiAttrs: { color: colour },
      })),
    ),
  );
}

// Jigsaw: the child's drawing turned into a keepsake-tin puzzle. Prodigi's board is a FIXED
// LANDSCAPE rectangle per size (250×200 / 375×285mm) — so, exactly like the frame, orientation
// is OURS: LANDSCAPE is native (the board as printed, no rotate) and PORTRAIT works on a swapped
// canvas, the fulfilment render rotating the finished print file 90° back to Prodigi's spec.
// Landscape leads (the native board) and is the default. NO colour — Prodigi fulfils one board
// per size (there's no colour SKU), so faking a colour choice would misrepresent the product.
// The board is Prodigi's EXACT 'jigsaw' printAreaSizes (sandbox, 27 Oct), bleed 0. (The tin 'lid' gets
// the same file; its area is 869×674px, a touch squarer, so Prodigi trims a sliver off the lid's sides.)
const JIGSAW_SIZES = [
  { size: '30 pieces', sku: 'JIGSAW-PUZZLE-30', ...exactPx({ w: 2952, h: 2362 }, 300), pricePence: 2600 },
  { size: '110 pieces', sku: 'JIGSAW-PUZZLE-110', ...exactPx({ w: 2952, h: 2362 }, 300), pricePence: 3000 },
  { size: '252 pieces', sku: 'JIGSAW-PUZZLE-252', ...exactPx({ w: 4429, h: 3366 }, 300), pricePence: 3500 },
];
function jigsawVariants(): VariantDef[] {
  return JIGSAW_SIZES.flatMap((s) =>
    (['landscape', 'portrait'] as const).map((orientation) => ({
      size: s.size, orientation,
      pricePence: s.pricePence,
      ...turned(s, orientation === 'portrait'),
      prodigiSku: s.sku,
      printTo: ['jigsaw', 'lid'], // Prodigi REQUIRES both: the puzzle and the tin lid (same picture)
    })),
  );
}

/** The orientation Prodigi's print file is FIXED at (orientation is ours — we offer the other
 * by placing on a SWAPPED canvas and rotating the finished print file 90° back at fulfilment).
 * Frames are fixed-portrait; jigsaw boards are fixed-landscape. Products without an orientation
 * dimension aren't listed — no rotation ever applies to them. See render.ts. */
export const PRODIGI_NATIVE_ORIENTATION: Record<string, 'portrait' | 'landscape'> = {
  framedPrint: 'portrait',
  jigsaw: 'landscape',
  blanket: 'landscape', // Prodigi's fleece-blanket print file is fixed LANDSCAPE (5905×3838 / 8740×5787px)
};

/**
 * Products DESIGNED on a canvas turned 90° from Prodigi's print file, with no orientation choice:
 * the tea towel is shown and designed LANDSCAPE (founder, 22 Oct — so it reads as a towel, not as
 * wrapping paper), while Prodigi's file is portrait. The variant's print canvas is the landscape
 * one; the finished file turns 90° back at render (render.ts), like a landscape frame.
 */
export const DESIGNED_TURNED: ReadonlySet<string> = new Set(['teaTowel']);

// Mug: ONE mug, the tracked two-tone 11oz range (white body + coloured rim/handle) — each colour is
// its own Prodigi SKU. (15oz white dropped 2026-07-09; PLAIN white dropped 2026-07-10 — the founder
// wanted the coloured two-tones only. Blue leads.) £18 (round, whole-pound pricing).
const MUG_TWOTONE = [
  { colour: 'blue', sku: 'H-MUG-11OZ-WBL', default: true }, { colour: 'black', sku: 'H-MUG-11OZ-WB' },
  { colour: 'green', sku: 'H-MUG-11OZ-WG' }, { colour: 'orange', sku: 'H-MUG-11OZ-WO' },
  { colour: 'pink', sku: 'H-MUG-11OZ-WP' }, { colour: 'red', sku: 'H-MUG-11OZ-WR' },
  { colour: 'yellow', sku: 'H-MUG-11OZ-WY' },
] as const;
function mugVariants(): VariantDef[] {
  // The wrap the print file must fill: Prodigi's EXACT printAreaSizes (2480×1122px @300dpi, sandbox
  // 27 Oct), bleed 0. (Their 11oz template PNG is 2473×1157 — a little taller — but the order is sized
  // to the API's area, so a template-shaped file lost ~3mm top and bottom.)
  return MUG_TWOTONE.map((m) => ({ size: '11oz', colour: m.colour, pricePence: 1800, ...exactPx({ w: 2480, h: 1122 }, 300), prodigiSku: m.sku, ...('default' in m ? { default: true } : {}) }));
}

// Kids tee: Stanley/Stella Mini Creator 2.0 — size AND colour are Prodigi attributes of ONE SKU.
// Every colour Prodigi offers (src/lib/garments.ts); white is the cheaper tier (£8 cost vs £9).
// Print file = Prodigi's printAreaSizes 3070×3070px (@300dpi, 260×260mm), IDENTICAL for every size —
// re-verified via GET /v4.0/products/TEE-SS-STTK909, 2026-10-15 (GB lab uk9). Made at 300dpi, judged at
// 150dpi as before (gateDpi) — founder, 29 Oct: send Prodigi its full resolution.
function kidsTeeVariants(): VariantDef[] {
  return KIDS_TEE_SIZES.flatMap((size) =>
    KIDS_TEE_COLOURS.map((c) => ({
      size, colour: c.name, pricePence: c.name === 'white' ? 2500 : 2700, ...exactPx({ w: 3070, h: 3070 }, 300), gateDpi: 150,
      prodigiSku: 'TEE-SS-STTK909', prodigiAttrs: { size, color: c.attr }, printTo: ['front'],
    })),
  );
}

// Adult tee: Stanley/Stella Sparker 2.0 (STTU171) — a UNISEX organic heavy tee, the grown-up
// sibling of the kids' Mini Creator (the family matching set stays in one garment family).
// Size + colour are Prodigi attributes; £12 cost in every colour, GB lab uk9.
// Print canvas 396×498mm: Prodigi's printAreaSizes = 4677×5881px (@300dpi — the full 16×20″
// DTG platen), IDENTICAL for every size — re-verified via GET /v4.0/products/TEE-SS-STTM559,
// 2026-10-15.
function adultTeeVariants(): VariantDef[] {
  return ADULT_TEE_SIZES.flatMap((s) =>
    ADULT_TEE_COLOURS.map((c) => ({
      size: s, colour: c.name, pricePence: 3200, ...exactPx({ w: 4677, h: 5881 }, 300), gateDpi: 150,
      prodigiSku: 'TEE-SS-STTM559', prodigiAttrs: { size: s.toLowerCase(), color: c.attr }, printTo: ['front'],
      ...(s === 'M' && c.name === 'white' ? { default: true } : {}), // sizes display XS→2XL; M is the sane default
    })),
  );
}

// Baby bodysuit: Rabbit Skins LONG-sleeve 4411. The short-sleeve 4424 is GB-fulfilled only in
// colours — its WHITE ships from Canada/Australia (5–21 days, and a child's image routed to a
// non-UK/EU lab fails our residency posture). White 4411 is GB-made, £9, next-day. Tracked
// shipping for a bodysuit-ALONE order is Express-only — flagged to the founder; in a family-set
// order the garments ship together tracked.
// Print canvas per size from Prodigi's API printAreaSizes (GET /v4.0/products/
// GLOBAL-BB-RS-4411, 2026-07-07): white NB/6-12/12-18 = 2130×2130px (@300dpi =
// 180×180mm). White 18-24 months lists TWO GB fulfilment routes with DIFFERENT
// print areas (2130×2130 AND 1500×2010 = 127×170mm) — Prodigi picks the lab at
// order time, so we design to the smaller INTERSECTION for that size; flagged in
// the founder's support email for confirmation.
function babyVariants(): VariantDef[] {
  return ['newborn', '6-12 months', '12-18 months', '18-24 months'].map((size) => ({
    size, colour: 'white', pricePence: 2200,
    ...exactPx(size === '18-24 months' ? { w: 1500, h: 2010 } : { w: 2130, h: 2130 }, 300), gateDpi: 150,
    prodigiSku: 'GLOBAL-BB-RS-4411', prodigiAttrs: { size, color: 'white' }, printTo: ['front'],
  }));
}

// Fleece blanket: WHITE only for now (founder call — no pink/blue). Orientation is OURS like the
// frame/jigsaw: Prodigi's blanket print file is fixed LANDSCAPE (printAreaSizes 5905×3838 /
// 8740×5787px @150dpi — their PSDs agree, 27 Oct); a portrait variant works on a swapped canvas and
// the fulfilment render rotates the finished file 90° back. Portrait still leads (+ default — its
// sku is the product key, kept for baskets and orders). Each size+colour is its own Prodigi SKU.
const BLANKET_SIZES = [
  { size: 'medium', px: { w: 5905, h: 3838 }, pricePence: 6000, sku: 'H-BLA-PBMWHITE' },
  { size: 'large', px: { w: 8740, h: 5787 }, pricePence: 7500, sku: 'H-BLA-PBLWHITE' },
] as const;
function blanketVariants(): VariantDef[] {
  return BLANKET_SIZES.flatMap((s) =>
    (['portrait', 'landscape'] as const).map((orientation) => ({
      size: s.size, orientation,
      pricePence: s.pricePence,
      ...turned(exactPx(s.px, 150), orientation === 'portrait'),
      prodigiSku: s.sku,
    })),
  );
}

// Phone cases (founder, 2026-10-21): every model × grade × finish Prodigi makes for it, from the
// sandbox-validated list in src/lib/phone-cases.ts. `size` is the PHONE MODEL; the print file is
// Prodigi's exact printAreaSizes for that SKU (~300dpi, the whole wrap — no trim, so bleed 0).
// Made in the UK (labs uk6/uk8). The default is the newest mainstream iPhone, snap, gloss.
const CASE_DEFAULT = { model: 'iPhone 17', grade: 'snap', finish: 'gloss' };
function phoneCaseVariants(): VariantDef[] {
  const newestFirst = [...PHONE_MODELS].reverse();
  return newestFirst.flatMap((m) =>
    CASE_GRADES.flatMap((grade) => {
      const px = m[grade];
      if (!px) return []; // Prodigi doesn't make this grade for this phone
      return CASE_FINISHES.map((finish) => ({
        size: m.name, grade, finish,
        pricePence: CASE_PRICE_PENCE[grade],
        wMm: Math.round((px.w / 300) * 25.4), hMm: Math.round((px.h / 300) * 25.4), dpi: 300, px, bleedMm: 0,
        prodigiSku: prodigiCaseSku(m, grade, finish),
        ...(m.name === CASE_DEFAULT.model && grade === CASE_DEFAULT.grade && finish === CASE_DEFAULT.finish ? { default: true } : {}),
      }));
    }),
  );
}

// ── Range expansion (founder, 2026-10-21 — D21; project-office/briefs/PRODUCT-RANGE-expansion.md §0) ──
// All Prodigi, all made in the UK; every SKU, attribute, lab and cost sandbox-quoted to GB on
// 2026-10-21. Seeded HIDDEN until samples + mockup blanks are in. Prices are whole pounds, free
// delivery baked in, ~15% net after ALL costs (card fee, 3% reprints, 5% codes, £0.55 running).
// Non-garment print files are Prodigi's EXACT printAreaSizes (`px`, bleed 0 — Prodigi's file
// already carries its own bleed), at the dpi Prodigi specifies them, so nothing rounds from mm.
function exactPx(px: { w: number; h: number }, dpi: number): Pick<VariantDef, 'wMm' | 'hMm' | 'dpi' | 'px' | 'bleedMm'> {
  return { wMm: Math.round((px.w / dpi) * 25.4), hMm: Math.round((px.h / dpi) * 25.4), dpi, px, bleedMm: 0 };
}
type Canvas = Pick<VariantDef, 'wMm' | 'hMm' | 'dpi' | 'px' | 'bleedMm' | 'gateDpi'>;
/** A print canvas turned 90° when `turn` (the orientation that isn't Prodigi's native one): w↔h, px too. */
function turned({ wMm, hMm, dpi, px, bleedMm, gateDpi }: Canvas, turn: boolean): Canvas {
  return {
    wMm: turn ? hMm : wMm, hMm: turn ? wMm : hMm, dpi,
    ...(px ? { px: turn ? { w: px.h, h: px.w } : px } : {}),
    ...(bleedMm !== undefined ? { bleedMm } : {}),
    ...(gateDpi ? { gateDpi } : {}),
  };
}

// Hoodies: like the tees, size + colour are Prodigi attributes of ONE SKU, the print is the front, and
// the file is Prodigi's exact print area at 300dpi, judged at 150dpi as before (gateDpi) — founder, 29 Oct.
function garmentVariants(o: { sku: string; sizes: string[]; colours: GarmentColour[]; printPx: { w: number; h: number }; pricePence: number; defaultSize?: string; attrSize?: (s: string) => string }): VariantDef[] {
  return o.sizes.flatMap((size) =>
    o.colours.map((c, ci) => ({
      size, colour: c.name, pricePence: o.pricePence, ...exactPx(o.printPx, 300), gateDpi: 150,
      prodigiSku: o.sku, prodigiAttrs: { size: o.attrSize ? o.attrSize(size) : size, color: c.attr }, printTo: ['front'],
      ...(o.defaultSize === size && ci === 0 ? { default: true } : {}),
    })),
  );
}

// Socks: one size (UK 6–10), sublimated all over — sold as a REPEAT PATTERN of the drawing (Prodigi
// can't guarantee placement on a sock). Ankle prints to 'front', tube to 'default'. uk9, Tracked 48.
const SOCKS = [
  { size: 'ankle', sku: 'GLOBAL-ANKLE-SOCKS', px: { w: 3543, h: 3543 }, printTo: ['front'] },
  { size: 'tube', sku: 'GLOBAL-TUBE-SOCKS', px: { w: 6141, h: 5433 }, printTo: ['default'] },
] as const;

// Wall height chart: canvas on wooden poster hangers (hanger colour = Prodigi `color`). Made at
// gb3, Evri Next Day (tracked). Prodigi prints NO ruler — the cm + ft/in markings are drawn INTO
// the print file at true scale (src/server/print/height-chart-geometry.ts, scale-tested ±1 px).
const HEIGHT_CHARTS = [
  { size: '20 × 120 cm', sku: 'POSTER-HANGER-20-CAN-ROL-SC-8X48', px: { w: 1200, h: 7200 }, pricePence: 3100 },
  { size: '30 × 120 cm', sku: 'POSTER-HANGER-30-CAN-ROL-SC-12X48', px: { w: 1800, h: 7200 }, pricePence: 3400 },
  { size: '20 × 150 cm', sku: 'POSTER-HANGER-20-CAN-ROL-SC-8X60', px: { w: 1200, h: 9000 }, pricePence: 3400 },
  { size: '30 × 150 cm', sku: 'POSTER-HANGER-30-CAN-ROL-SC-12X60', px: { w: 1800, h: 9000 }, pricePence: 3600 },
] as const;
const HANGER_COLOURS = ['natural', 'black', 'white'];

// Wrapping paper: FSC 95gsm, a REPEAT PATTERN of the drawing. gb2. NB Standard is Royal Mail RM24
// — UNTRACKED (sandbox 2026-10-21); tracked (Express, RM Tracked 24) is +£1.05. Founder to decide.
// ROLLS ONLY (founder, 22 Oct) — the 3-sheet packs (WRAP-3-50X70 / -75X90) are off the range.
const WRAPPING_PAPER = [
  { size: '2 m roll', sku: 'WRAP-ROL-70X200', px: { w: 4133, h: 11811 }, kraftSku: 'WRAP-KFT-ROL-70X200', kraftPx: { w: 8280, h: 23610 }, pricePence: 2300 },
  { size: '3 m roll', sku: 'WRAP-ROL-70X300', px: { w: 4133, h: 17716 }, kraftSku: 'WRAP-KFT-ROL-70X300', kraftPx: { w: 8280, h: 35430 }, pricePence: 2800 },
  { size: '5 m roll', sku: 'WRAP-ROL-70X500', px: { w: 4133, h: 29527 }, kraftSku: 'WRAP-KFT-ROL-70X500', kraftPx: { w: 8280, h: 59070 }, pricePence: 3800 },
] as const;

// Pet bandana: polyester, sublimated. uk9, Tracked 48. Each SKU also lists a non-GB route with a
// smaller print area; the GB route's size is the one here.
const BANDANAS = [
  { size: 'small', sku: 'PET-BANDANA-SML', px: { w: 7500, h: 2244 }, pricePence: 1800 },
  { size: 'medium', sku: 'PET-BANDANA-MED', px: { w: 9447, h: 2952 }, pricePence: 1800 },
  { size: 'large', sku: 'PET-BANDANA-LRG', px: { w: 10158, h: 3306 }, pricePence: 1900 },
] as const;

// Socks, wrapping paper and tea towel print a seamless REPEAT of the drawing — the 'pattern' magic
// edit (src/lib/patterns.ts → PATTERN_PRODUCT_KEYS; pixels in src/server/print/pattern.ts).
export { PATTERN_PRODUCT_KEYS } from '@/lib/patterns';

// The founder-approved launch range (2026-07-01). Prices are our retail pence, VAT-inclusive with
// FREE tracked delivery baked in (the shipping cost is inside the price, no separate line). Every
// SKU is GB-fulfilled by Prodigi. See project-office/briefs/PRICING.md + the pricing Sheet.
const DEFS: Record<string, ProductDef> = {
  framedPrint: {
    category: 'PRINT', label: 'framed print', blurb: 'their masterpiece, ready to hang', print: true, visibleInShop: true,
    description: 'A gallery-quality print of the original in a hand-finished frame, ready to hang — every wonky bit treasured. Eight frames to suit any wall (gold is our signature).',
    specs: { material: 'fine-art paper', glazing: 'shatterproof' },
    variants: frameVariants(),
  },
  mug: {
    category: 'MUG', label: 'mug', blurb: 'a morning cuppa, made magic', print: true, visibleInShop: true,
    description: "Their masterpiece wrapped around a sturdy two-tone mug — for the grown-up who'll treasure every sip.",
    specs: { material: 'ceramic', care: 'dishwasher safe · microwave safe' },
    variants: mugVariants(),
  },
  cushion: {
    category: 'CUSHION', label: 'cushion', blurb: 'a squishy keepsake for the sofa', print: true, visibleInShop: true,
    description: 'A plump cushion with their artwork on it — heart, round or square, a keepsake you can actually hug.',
    specs: { material: 'faux suede / linen', filling: 'fibre fill included' },
    variants: [
      // Heart + round: Prodigi only makes these shapes in faux SUEDE, single-sided, STONE back.
      // The heart's print area is WIDER than tall (printAreaSizes 2008×1725px, their PSD 2009×1725,
      // 27 Oct): exact px, bleed 0, so Prodigi has nothing to crop. (It was a 280mm square + bleed.)
      { size: 'heart', pricePence: 2200, ...exactPx({ w: 2008, h: 1725 }, 150), prodigiSku: 'GLOBAL-CUSH-SH-SCSSS' },
      { size: '18″ round', pricePence: 3000, ...exactPx({ w: 2775, h: 2775 }, 150), prodigiSku: 'GLOBAL-CUSH-18R-SCSSS' },
      // Squares: faux LINEN, white. Single-sided is the default; double-sided (DUAL) is the paid
      // upgrade that unlocks image-both-sides / a colour back — ONE double-wide [front | back]
      // print file. wMm/hMm here is the per-FACE size: the mockup shows one face either way, and
      // the DUAL fulfilment assembles the side-by-side double-wide from two face renders.
      // Round + squares: Prodigi's EXACT printAreaSizes (sandbox, 27 Oct — a DUAL's is two faces wide),
      // bleed 0; their area is the cushion plus its own bleed (18.5″ for the 18″ round).
      { size: '12″ square', sides: 'single', pricePence: 3000, ...exactPx({ w: 1875, h: 1875 }, 150), prodigiSku: 'GLOBAL-CUSH-12X12-LIN' },
      { size: '12″ square', sides: 'double', pricePence: 3500, ...exactPx({ w: 1875, h: 1875 }, 150), prodigiSku: 'GLOBAL-CUSH-12X12-LIN-DUAL' },
      { size: '22″ square', sides: 'single', pricePence: 4000, ...exactPx({ w: 3375, h: 3375 }, 150), prodigiSku: 'GLOBAL-CUSH-22X22-LIN' },
      { size: '22″ square', sides: 'double', pricePence: 4500, ...exactPx({ w: 3375, h: 3375 }, 150), prodigiSku: 'GLOBAL-CUSH-22X22-LIN-DUAL' },
    ],
  },
  storybook: {
    category: 'BOOK', label: 'storybook', blurb: "they're the hero of the story", print: true,
    description: 'A keepsake hardcover book starring your little one and their artwork — the tale they were always the hero of.',
    specs: { material: 'hardcover, gloss', pages: '24 pages' },
    variants: [
      // Prodigi's EXACT 'default' page area (printAreaSizes, sandbox 27 Oct) — the trimmed page, no bleed.
      { size: 'A5', pricePence: 2600, ...exactPx({ w: 1748, h: 2480 }, 300), prodigiSku: 'BOOK-FE-A5-P-HARD-G' },
      { size: 'A4', pricePence: 2900, ...exactPx({ w: 2480, h: 3507 }, 300), prodigiSku: 'BOOK-FE-A4-P-HARD-G' },
    ],
  },
  kidsTee: {
    category: 'APPAREL', label: 'kids tee', blurb: 'their masterpiece, worn with pride', print: true, visibleInShop: true,
    description: 'A soft organic-cotton tee with their own drawing printed on the front — made to be worn (and washed) again and again.',
    specs: { material: '100% organic cotton', print: 'up to 26 × 26 cm on the front', care: 'wash at 30°, inside out' },
    variants: kidsTeeVariants(),
  },
  jigsaw: {
    category: 'PUZZLE', label: 'jigsaw', blurb: 'piece their masterpiece together', print: true, visibleInShop: true,
    description: 'Their drawing turned into a jigsaw in a keepsake tin — rainy-afternoon magic, piece by piece.',
    specs: { material: 'board, in a keepsake tin', delivery: 'tracked' },
    variants: jigsawVariants(),
  },
  blanket: {
    category: 'BLANKET', label: 'fleece blanket', blurb: 'cuddles, with their art woven in', print: true, visibleInShop: true,
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
  // 7×5 portrait on Prodigi's Fedrigoni "classic" stock — the one built to print INSIDE and out
  // (CLASSIC-GRE-FEDR-7X5). One premium stock (founder call). The print file is a 4-panel spread
  // [outer rear | outer front | inside-left | inside-right]; wMm/hMm here are the FRONT panel
  // (the design + mockup geometry) — fulfilment assembles the full spread, like the DUAL cushion.
  card: {
    category: 'CARD', label: 'greetings card', blurb: 'a little card, a big smile', print: true, visibleInShop: true,
    description: "A folded 7×5 card with your little one's artwork on the front, on premium Fedrigoni stock. Add a printed message inside, or leave it blank to write in yourself.",
    specs: { material: '330gsm Fedrigoni', size: '7×5″ portrait', inside: 'blank, or a printed message', envelope: 'included' },
    variants: [
      { size: '7×5″', pricePence: 550, wMm: 127, hMm: 178, dpi: 300, prodigiSku: 'CLASSIC-GRE-FEDR-7X5-BLA' },
    ],
  },
  // Greetings-card MULTIPACKS (founder, 2026-10-21): the same 7×5″ Fedrigoni card, a different (or
  // the same) drawing on each front, the inside BLANK to write in — no printed message on a pack.
  // One basket line carries the N cards; the order splits it into card lines at an equal share of
  // the pack price (src/lib/card-packs.ts), so Prodigi gets N cards in one order. Sandbox
  // 2026-10-21: £1.10 a card + a FLAT £0.95 Guernsey Post (untracked, uk7) for 1–15 cards.
  // Prices must divide evenly by the pack size (£12 / 5 = £2.40, £21 / 10 = £2.10). LIVE 2026-10-21.
  cardPack: {
    category: 'CARD', label: 'card pack', blurb: 'a stack of little masterpieces, ready to send', print: true, visibleInShop: true,
    description: "A pack of 7×5 cards, each with one of your little one's drawings on the front — mix and match, or the same favourite on every one. Blank inside, ready for your own words, for all the birthdays to come.",
    specs: { material: '330gsm Fedrigoni', size: '7×5″ portrait', inside: 'blank, to write in yourself', designs: 'a different drawing on every card, or the same', envelopes: 'one with every card' },
    variants: [
      { size: 'pack of 5', pricePence: 1200, wMm: 127, hMm: 178, dpi: 300, prodigiSku: 'CLASSIC-GRE-FEDR-7X5-BLA' },
      { size: 'pack of 10', pricePence: 2100, wMm: 127, hMm: 178, dpi: 300, prodigiSku: 'CLASSIC-GRE-FEDR-7X5-BLA' },
    ],
  },
  // The DATED 2027 wall calendar (founder, 2026-10-25 — CHRISTMAS-range-and-postage.md §5): Prodigi
  // prints the 2027 date grid; we send THIRTEEN files, the cover + one picture per month, each to its
  // own print area (printTo = CALENDAR_PAGES in src/lib/calendar.ts, pinned equal by a test). Up to
  // 12 drawings + a cover; gaps repeat, so one drawing still makes a whole calendar. The optional
  // 'back cover' area is not sent (Prodigi's plain back). Sandbox GET /v4.0/products/{sku}: a page is
  // A4 3507×2480 px / A5 2480×1748 px; cost as undated (A4 £10 / A5 £9 + £4.35, lab uk15, no Express).
  // Re-priced A5 £22 · A4 £24 (founder, 2026-10-25). Swap to the 2028 SKUs when Prodigi lists them.
  calendar: {
    category: 'PRINT', label: 'calendar', blurb: 'a year of their masterpieces', print: true, visibleInShop: true,
    description: 'A 2027 wall calendar carrying a year of their drawings — a new little masterpiece to smile at every month, and one on the cover.',
    specs: { material: 'silk 300gsm', format: 'landscape wall calendar', dates: 'includes 2027 calendar dates', pages: 'a cover + 12 months' },
    variants: (
      [
        { size: 'A5', pricePence: 2200, px: { w: 2480, h: 1748 }, sku: 'CALENDAR-A5-L-DATED' },
        { size: 'A4', pricePence: 2400, px: { w: 3507, h: 2480 }, sku: 'CALENDAR-A4-L-DATED' },
      ] as const
    ).map((c) => ({
      size: c.size, pricePence: c.pricePence, ...exactPx(c.px, 300), prodigiSku: c.sku,
      printTo: ['cover', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
    })),
  },
  adultTee: {
    category: 'APPAREL', label: 'adult tee', blurb: 'worn by their biggest fan', print: true, visibleInShop: true,
    description: "The grown-up version of the kids tee — the same organic cotton, sized up, with your little one's artwork on the front. A relaxed unisex fit for mums, dads and anyone in their fan club.",
    specs: { material: '100% organic cotton, heavyweight', fit: 'unisex, XS–2XL', print: 'up to 40 × 50 cm on the front', care: 'wash at 30°, inside out' },
    variants: adultTeeVariants(),
  },
  apron: {
    category: 'APPAREL', label: 'apron', blurb: 'little chef, big mess, kept forever', print: true,
    description: 'A wipe-clean apron with their artwork on it — for baking days, painting days, and every happy mess.',
    specs: { material: 'poly-cotton', ties: 'black' },
    variants: [
      // Prodigi's EXACT print areas (printAreaSizes @300dpi, sandbox 27 Oct; their PSDs are the same
      // shape at half size) — right before the apron is ever on show. (It was a 220×280 / 300×360mm guess.)
      { size: 'child', pricePence: 2500, ...exactPx({ w: 5850, h: 7500 }, 300), prodigiSku: 'H-APR-CA-BTIE' },
      { size: 'adult', pricePence: 2900, ...exactPx({ w: 7500, h: 10500 }, 300), prodigiSku: 'H-APR-AA-BTIE' },
    ],
  },
  // Christmas 2026 (D24): two separate products (founder, 26 Oct — "separate them out, label them as I have").
  // The CERAMIC ornament is uk9 → Royal Mail Tracked 48 (£8 + £4.30), sharing a parcel with the sack / mug /
  // tea towel; printed on ONE side (Prodigi: "single-sided print").
  ceramicOrnament: {
    category: 'FESTIVE', label: 'ceramic christmas ornament', blurb: "this year's ornament — one for every christmas they're little", print: true, visibleInShop: true,
    description: "Their drawing on a glossy ceramic ornament for the tree — make a new one every Christmas and watch the tree fill up with a timeline of their drawings. A flat 7.5 cm disc on a gold string.",
    specs: { size: '7.5 cm disc', finish: 'flat, gloss ceramic, printed on one side', string: 'gold', made: 'in the UK' },
    // Prodigi's EXACT print area (sandbox GET /v4.0/products, 27 Oct): 885×885 px, no bleed. (It was
    // 82 mm + 3 mm bleed from their template canvas — a 1038 px file Prodigi shrank to fit, bleed and all.)
    variants: [{ size: '7.5 cm', pricePence: 2100, ...exactPx({ w: 885, h: 885 }, 300), prodigiSku: 'XMAS-PORC-BAUB' }],
  },
  // The plastic BALL (XMAS-PLAS-BAUB): printed on BOTH sides, shatterproof, from uk5 → Royal Mail RM24
  // (£5 + £6.45, UNTRACKED) — priced at ~15% net after all costs.
  christmasBauble: {
    category: 'FESTIVE', label: 'christmas bauble', blurb: "this year's bauble — one for every christmas they're little", print: true, visibleInShop: true,
    description: "Their drawing on a shatterproof bauble for the tree, printed on both sides — so it looks lovely from every angle and won't break if little hands drop it.",
    specs: { size: '8 cm ball', print: 'both sides', finish: 'shatterproof clear plastic, chrome cap, silver string', made: 'in the UK' },
    // one print file, printed on both sides of the ball (Prodigi printAreaSizes, sandbox 2026-10-25)
    variants: [{ size: '8 cm', pricePence: 1900, ...exactPx({ w: 1003, h: 1062 }, 300), prodigiSku: 'XMAS-PLAS-BAUB' }],
  },
  sack: {
    category: 'FESTIVE', label: 'christmas sack', blurb: 'where the magic waits on christmas eve', print: true, visibleInShop: true, // D24
    description: 'A cotton Christmas sack with their artwork on it — filled on Christmas Eve, treasured for years after.',
    specs: { material: 'cotton', size: '19×30″' },
    // 320×500mm = Prodigi's print panel, NOT the whole sack: made at their printAreaSizes (3779×5905px
    // @300dpi, sandbox 27 Oct) but judged at 150dpi as it always was (gateDpi).
    variants: [{ size: 'one size', pricePence: 3500, ...exactPx({ w: 3779, h: 5905 }, 300), gateDpi: 150, prodigiSku: 'XMAS-SACK' }],
  },
  // The CHRISTMAS TABLE (founder, 27 Oct — go-to-market C25): cork-backed placemats + coasters from uk9,
  // the same parcel as the ornament + sack. A Prodigi pack has ONE print area ('default'): one drawing
  // prints on every piece. On their own: placemats in a 4-pack (£60 — founder, 27 Oct), coasters in a 6-pack (£32). The
  // other packs (1/2/6 placemats, 1/2/4 coasters) exist ONLY for the family bundle (it uses the 2-packs
  // and the 4-packs) — never priced or shown on their own (BUNDLE_ONLY_SKUS, src/lib/christmas-bundle.ts);
  // their price here is for reference only. Print areas: sandbox GET /v4.0/products, 27 Oct.
  // ON SHOW (founder, 28 Oct). TODO(founder samples): no Prodigi blank for either in .prodigi-assets yet,
  // so they show the plain tile until the founder's sample photos give them a mockup.
  placemat: {
    category: 'FESTIVE', label: 'placemats', blurb: 'their masterpiece at every place', print: true, visibleInShop: true,
    description: 'A set of four cork-backed placemats, each printed with the same drawing — Christmas dinner, Sunday lunch, every breakfast after.',
    specs: { material: 'cork-backed', size: '29 × 20.5 cm', pack: 'four placemats, one drawing', made: 'in the UK' },
    variants: (
      [
        { size: 'pack of 4', pricePence: 6000, sku: 'H-PLACE-4PK' },
        { size: 'pack of 1', pricePence: 1600, sku: 'H-PLACE-1PK' },
        { size: 'pack of 2', pricePence: 3200, sku: 'H-PLACE-2PK' },
        { size: 'pack of 6', pricePence: 9600, sku: 'H-PLACE-6PK' },
      ] as const
    ).map((p) => ({ size: p.size, pricePence: p.pricePence, ...exactPx({ w: 3425, h: 2421 }, 300), prodigiSku: p.sku })),
  },
  // Coasters on their own start at TWO (founder, 29 Oct): packs of 2 / 4 / 6 at £18 / £26 / £34 — priced so
  // each still clears 10% net with a 10% creator code + 5% commission (pinned by a test). The 6-pack stays
  // the default (it keeps the product key as its sku); the single coaster is bundle-only, never sold.
  coaster: {
    category: 'FESTIVE', label: 'coasters', blurb: 'a little masterpiece under every mug', print: true, visibleInShop: true,
    description: 'Cork-backed coasters, each printed with the same drawing — in packs of 2, 4 or 6. For the mince pies and the cocoa, and long after.',
    specs: { material: 'cork-backed', size: '10.6 cm square', pack: '2, 4 or 6 coasters, one drawing', made: 'in the UK' },
    variants: (
      [
        { size: 'pack of 2', pricePence: 1800, sku: 'H-COAST-2PK' },
        { size: 'pack of 4', pricePence: 2600, sku: 'H-COAST-4PK' },
        { size: 'pack of 6', pricePence: 3400, sku: 'H-COAST-6PK', default: true },
        { size: 'pack of 1', pricePence: 550, sku: 'H-COAST-1PK' },
      ] as const
    ).map((p) => ({ size: p.size, pricePence: p.pricePence, ...exactPx({ w: 1251, h: 1251 }, 300), prodigiSku: p.sku, ...('default' in p ? { default: true } : {}) })),
  },
  // The CHRISTMAS FAMILY BUNDLE (founder, 29 Oct — three simple sizes, no add-ons): N placemats + N
  // coasters + N ceramic ornaments, all uk9, ONE tracked parcel — a set for 2 (£78), 4 (£145) or 8
  // (£279), ≈ 20% net after every cost. Not printed itself: the order splits it into its pieces' own
  // variants (src/lib/christmas-bundle.ts → orders.ts). Builder: /customize/christmasBundle.
  christmasBundle: {
    category: 'FESTIVE', label: 'christmas family bundle', blurb: 'the whole family’s christmas, in one parcel', print: false, visibleInShop: true,
    description: 'Their drawings on the Christmas table and on the tree: placemats and coasters wearing a drawing, and a ceramic ornament for everyone with its own. A set for 2, 4 or 8 — made in the UK and sent together in one tracked parcel.',
    specs: { 'in the set': 'placemats, coasters and ceramic ornaments — 2, 4 or 8 of each', drawings: 'one on the placemats, one on the coasters, one on each ornament', delivery: 'one tracked parcel' },
    variants: BUNDLE_SIZES.map((s) => ({ size: s.size, pricePence: s.pricePence, wMm: 0, hMm: 0 })),
  },
  // The CHRISTMAS EVE BUNDLE — RETIRED (founder, 29 Oct: "drop it for simplicity"). Kept as a PAUSED
  // row so the seed takes it off sale everywhere (inactive ⇒ never priced, never orderable, not in the
  // shop); its builder and expansion are gone.
  christmasEveBundle: {
    category: 'FESTIVE', label: 'christmas eve bundle', blurb: 'retired', print: false, visibleInShop: false, paused: true,
    description: 'No longer sold.',
    specs: {},
    variants: [{ pricePence: 6200, wMm: 0, hMm: 0 }],
  },
  phoneCase: {
    category: 'TECH', label: 'phone case', blurb: 'their masterpiece, in your pocket', print: true, visibleInShop: true,
    description: "Their drawing printed right round a phone case, edge to edge — so it's with you everywhere. Snap is slim and light; tough adds a cushioned inner layer for the drops. Gloss or matte.",
    specs: { material: 'polycarbonate shell (tough: + shock-absorbing liner)', print: 'printed edge to edge, wraps round the sides', finish: 'gloss or matte', made: 'in the UK' },
    variants: phoneCaseVariants(),
  },
  // ── Range expansion (D21) — LIVE 2026-10-21 (founder): socks, height chart, wrapping paper,
// tea towel, playing cards (+ card packs above). HELD until ready: the hoodies (need a hoodie
// packshot + confirmed chest sizes) and the pet bandana (its shape is drawn from a guess) ──
  // (The women's Dazzler sweatshirt was left out — founder, 2026-10-21.)
  // Categories reuse the existing enum (a new value needs a migration): socks/hoodies/bandana → wear,
  // height chart → cards & prints, wrapping paper → festive, tea towel → home,
  // playing cards → gifts.
  socks: {
    category: 'APPAREL', label: 'socks', blurb: 'their masterpiece, on repeat, on your feet', print: true, visibleInShop: true,
    description: "Their drawing turned into a cheerful all-over pattern on a pair of socks — the gift a grown-up actually wears. One size fits most (UK 6–10).",
    specs: { material: 'polyester, printed all over', size: 'one size, UK 6–10', styles: 'ankle or tube', care: 'machine wash at 30°', made: 'in the UK' },
    variants: SOCKS.map((s) => ({ size: s.size, pricePence: 2000, ...exactPx(s.px, 300), prodigiSku: s.sku, printTo: [...s.printTo] })),
  },
  heightChart: {
    category: 'PRINT', label: 'height chart', blurb: 'watch them grow up their own artwork', print: true, visibleInShop: true,
    description: "A canvas height chart on wooden hangers, with their drawing running alongside the ruler — mark every birthday as they grow past it. Hang it with the bottom edge 40 cm off the floor and the ruler reads true. They're only little once.",
    specs: { material: 'polycanvas, 400gsm', hangers: 'wooden — natural, black or white', markings: 'cm and feet & inches', measures: '50–150 cm (120 cm chart) · 50–190 cm (150 cm chart)', hanging: 'bottom edge 40 cm off the floor', made: 'in the UK' },
    variants: HEIGHT_CHARTS.flatMap((h) =>
      HANGER_COLOURS.map((colour) => ({ size: h.size, colour, pricePence: h.pricePence, ...exactPx(h.px, 150), prodigiSku: h.sku, prodigiAttrs: { color: colour } })),
    ),
  },
  kidsHoodie: {
    category: 'APPAREL', label: 'kids hoodie', blurb: 'their masterpiece, snuggled up', print: true,
    description: 'A cosy organic-cotton hoodie with their own drawing on the front — the winter sibling of the kids tee.',
    specs: { material: '100% organic cotton', print: 'up to 26 × 26 cm on the front', care: 'wash at 30°, inside out', made: 'in the UK' },
    variants: garmentVariants({ sku: 'HOOD-SS-STSK911', sizes: KIDS_HOODIE_SIZES, colours: KIDS_HOODIE_COLOURS, printPx: { w: 3070, h: 3070 }, pricePence: 4300 }),
  },
  adultHoodie: {
    category: 'APPAREL', label: 'adult hoodie', blurb: 'matching hoodies for the whole fan club', print: true,
    description: "A soft unisex hoodie with your little one's artwork on the front — for the grown-ups who'd wear their masterpiece every day.",
    specs: { material: '85% organic cotton, 15% recycled polyester', fit: 'unisex, XS–3XL', print: 'up to 26 × 26 cm on the front', care: 'wash at 30°, inside out', made: 'in the UK' },
    // TODO(before it's on show): Prodigi's GB front print area for this SKU DIFFERS by colour and size
    // (printAreaSizes 3070×3070, 4724×4724 and 3307×4606px — src/server/__tests__/fixtures/
    // prodigi-print-areas.json) but every variant is designed to 3070². Pick per-variant areas (or the
    // one Prodigi confirms for uk9) before un-hiding; the catalogue sync and print-spec test flag it.
    variants: garmentVariants({ sku: 'HOOD-SS-STSU812', sizes: ADULT_HOODIE_SIZES, colours: ADULT_HOODIE_COLOURS, printPx: { w: 3070, h: 3070 }, pricePence: 4200, defaultSize: 'M', attrSize: (s) => s.toLowerCase() }),
  },
  wrappingPaper: {
    category: 'FESTIVE', label: 'wrapping paper', blurb: 'every present wrapped in their art', print: true, visibleInShop: true,
    description: 'Their drawing turned into a repeating pattern on proper gift wrap — so the paper is half the present. On a 70cm-wide roll: 2, 3 or 5 metres, in white or brown kraft (on kraft the colours come out a little earthier, and the paper shows through where the drawing is white).',
    specs: { material: 'FSC-certified 95gsm paper', formats: 'a 70cm-wide roll — 2, 3 or 5 m', made: 'in the UK' },
    // Two papers (D24): white, and brown KRAFT (the scrapbook look). Kraft is a 300dpi file at the same
    // cost (£8/£11/£17 + £5.70, gb2). Printing is CMYK on brown, so the paper shows where the drawing is white.
    variants: WRAPPING_PAPER.flatMap((w) => [
      { size: w.size, colour: 'white', pricePence: w.pricePence, ...exactPx(w.px, 150), prodigiSku: w.sku },
      { size: w.size, colour: 'kraft', pricePence: w.pricePence, ...exactPx(w.kraftPx, 300), prodigiSku: w.kraftSku },
    ]),
  },
  teaTowel: {
    category: 'BLANKET', label: 'tea towel', blurb: 'drying up, with their art', print: true, visibleInShop: true,
    description: "A cotton tea towel printed all over with a pattern of their drawing — for gran's kitchen, or yours.",
    specs: { material: 'cotton', care: 'machine washable', made: 'in the UK' },
    // H-TEATOWEL-SUB ONLY: the cotton-twill / poly-twill tea towels are made in the US (£72 postage).
    // designed LANDSCAPE (DESIGNED_TURNED): Prodigi's file is 5492×8208 portrait; we design 8208×5492
    variants: [{ size: 'one size', pricePence: 2700, ...exactPx({ w: 8208, h: 5492 }, 300), prodigiSku: 'H-TEATOWEL-SUB' }],
  },
  // ── Christmas jumpers (D24, 2026-10-25): printed SWEATSHIRTS in Christmas colours (Prodigi makes no
  // knitwear). Held until a sweatshirt packshot is staged, like the hoodies. Priced ~15% net after all costs. ──
  kidsJumper: {
    category: 'APPAREL', label: 'kids jumper', blurb: 'the christmas jumper they drew themselves', print: true,
    description: "A cosy organic-cotton sweatshirt with their own drawing on the front — in Christmas green, or every day in white, grey, navy or black.",
    specs: { material: '100% organic cotton (Stanley/Stella)', print: 'up to 26 × 26 cm on the front', care: 'wash at 30°, inside out', made: 'in the UK' },
    // £19 + £4.30 (uk9, Tracked 48)
    variants: garmentVariants({ sku: 'SWEAT-SS-STSK913', sizes: KIDS_JUMPER_SIZES, colours: KIDS_JUMPER_COLOURS, printPx: { w: 3070, h: 3070 }, pricePence: 3800, defaultSize: '5-6 years' }),
  },
  christmasJumper: {
    category: 'APPAREL', label: 'christmas jumper', blurb: 'matching jumpers for the grown-ups', print: true,
    description: "A soft crew-neck sweatshirt in fire red or bottle green with your little one's drawing on the front — the family Christmas jumper, designed by the smallest person in the house.",
    specs: { material: '80% cotton, 20% polyester (AWDis)', fit: 'unisex, S–2XL', print: 'up to 39 × 49 cm on the front', care: 'wash at 30°, inside out', made: 'in the UK' },
    // £15 + up to £4.30 (uk2 1st Class OR uk9 Tracked 48 — Prodigi's pick per colour/size)
    variants: garmentVariants({ sku: 'GLOBAL-SWEAT-AWD-JH030', sizes: ADULT_JUMPER_SIZES, colours: ADULT_JUMPER_COLOURS, printPx: { w: 4606, h: 5787 }, pricePence: 3200, defaultSize: 'M', attrSize: (s) => s.toLowerCase() }),
  },
  petBandana: {
    category: 'APPAREL', label: 'pet bandana', blurb: 'the dog, wearing their drawing of the dog', print: true,
    description: "A soft bandana for the family dog (or a very patient cat) with their artwork on it — pets are family too.",
    specs: { material: 'polyester', sizes: 'small, medium or large', made: 'in the UK' },
    variants: BANDANAS.map((b) => ({ size: b.size, pricePence: b.pricePence, ...exactPx(b.px, 300), prodigiSku: b.sku })),
  },
  playingCards: {
    category: 'PUZZLE', label: 'playing cards', blurb: 'deal in their masterpiece', print: true, visibleInShop: true,
    description: 'A full 54-card deck with their drawing on the back of every card, in a white presentation box — for family card nights.',
    specs: { cards: '54, one design on every back', size: '6 × 9 cm', box: 'white presentation box', made: 'in the UK' },
    // Standard post is Royal Mail RM24 (UNTRACKED), £6.45. Budget (RM48, £3.20) would allow ~£19 —
    // a per-product shipping rule the founder hasn't asked for, so this is priced on Standard.
    variants: [{ size: '54 cards', pricePence: 2400, ...exactPx({ w: 820, h: 1122 }, 300), prodigiSku: 'PLAY-CARD' }],
  },
  giftWrap: {
    category: 'ADDON', label: 'gift wrap', blurb: 'a handwritten-style note + wrap', print: false, paused: true,
    description: "We'll wrap it beautifully and tuck in a handwritten-style note.",
    specs: {},
    variants: [{ pricePence: 300, wMm: 0, hMm: 0 }], // no Prodigi SKU ⇒ MANUAL
  },
};

// Front-of-shop order: the EXPECTED popularity to begin with, then actual sales (popularity.ts).
function popularRankOf(key: string): number | null {
  const i = EXPECTED_POPULARITY.indexOf(key);
  return i === -1 ? null : i + 1;
}

/** A short, stable code for a variant's size/colour, used in its internal sku. */
function slug(s: string | undefined): string | null {
  if (!s) return null;
  // '+' must survive ("Galaxy S23+" ≠ "Galaxy S23") — stripping it made two phones share a sku
  return s.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '');
}

/**
 * The seeded price list straight from the DEFS (no DB): every variant's sku, retail pence, Prodigi
 * SKU and whether its product is on show. Pure — what the seed WILL write, so the agreed prices and
 * the static fallback can be unit-tested without a database.
 */
/** A variant's stored attributes (size / colour / orientation / sides / grade / finish) — the ONE
 * place they're built, for the seed and for anything that needs a variant as the DB holds it. */
function variantAttributes(v: VariantDef): Record<string, string> {
  const a: Record<string, string> = {};
  if (v.size) a.size = v.size;
  if (v.colour) a.colour = v.colour;
  if (v.orientation) a.orientation = v.orientation;
  if (v.sides) a.sides = v.sides;
  if (v.grade) a.grade = v.grade;
  if (v.finish) a.finish = v.finish;
  return a;
}

export function definedPriceList(): Array<{ productKey: string; sku: string; isDefault: boolean; pricePence: number; prodigiSku: string | null; prodigiAttrs: Record<string, string> | null; attributes: Record<string, string>; visibleInShop: boolean; paused: boolean; px: { w: number; h: number } | null; dpi: number; bleedMm: number }> {
  return Object.entries(DEFS).flatMap(([productKey, def]) => {
    const defaultIndex = Math.max(0, def.variants.findIndex((v) => v.default));
    return def.variants.map((v, i) => ({
      productKey, sku: variantSku(productKey, v, i === defaultIndex), isDefault: i === defaultIndex,
      pricePence: v.pricePence, prodigiSku: v.prodigiSku ?? null, prodigiAttrs: v.prodigiAttrs ?? null, attributes: variantAttributes(v),
      visibleInShop: def.visibleInShop ?? false, paused: def.paused ?? false,
      px: v.px ?? (def.print ? { w: mmToPx(v.wMm, v.dpi ?? 300), h: mmToPx(v.hMm, v.dpi ?? 300) } : null),
      dpi: v.dpi ?? 300, bleedMm: v.bleedMm ?? 3,
    }));
  });
}

/**
 * The products as the DEFS describe them (no DB, no variants): our own words + specs + whether each
 * is on show. Pure and read-only — for the public product pages, their structured data and the
 * Merchant Center feed (src/server/shop), which pair it with {@link definedPriceList} for prices.
 */
export function definedProducts(): Array<{ key: string; category: string; label: string; blurb: string; description: string; specs: Record<string, string>; visibleInShop: boolean; paused: boolean }> {
  return Object.entries(DEFS).map(([key, def]) => ({
    key, category: def.category, label: def.label, blurb: def.blurb, description: def.description, specs: { ...def.specs },
    visibleInShop: def.visibleInShop ?? false, paused: def.paused ?? false,
  }));
}

/** Stable sku for a variant: the default keeps the legacy product key (back-compat). */
function variantSku(productKey: string, v: VariantDef, isDefault: boolean): string {
  if (isDefault) return productKey;
  // orientation appears in the sku ONLY for landscape — portrait skus keep their
  // pre-orientation names (no churn in baskets, orders or tests).
  return [productKey, slug(v.size), slug(v.colour), v.orientation === 'landscape' ? 'landscape' : null, v.sides === 'double' ? 'double' : null, slug(v.grade), slug(v.finish)].filter(Boolean).join('-');
}

/** A printed variant's print_templates row (less its variant id) — the ONE place it's built. */
function printTemplateOf(v: VariantDef) {
  const dpi = v.dpi ?? 300;
  const wPx = v.px?.w ?? mmToPx(v.wMm, dpi);
  const hPx = v.px?.h ?? mmToPx(v.hMm, dpi);
  return {
    orientation: (v.wMm > v.hMm ? 'LANDSCAPE' : v.wMm < v.hMm ? 'PORTRAIT' : 'SQUARE') as 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE',
    printWidthMm: v.wMm, printHeightMm: v.hMm, requiredDpi: dpi, printWidthPx: wPx, printHeightPx: hPx, bleedMm: v.bleedMm ?? 3,
    aspectMilli: Math.round((v.wMm / v.hMm) * 1000),
    // judged at a lower dpi than it's made at (gateDpi) ⇒ it needs proportionally fewer source px
    minSourceWidthPx: v.gateDpi ? Math.round((wPx * v.gateDpi) / dpi) : wPx,
    minSourceHeightPx: v.gateDpi ? Math.round((hPx * v.gateDpi) / dpi) : hPx,
  };
}

/**
 * Every printed, Prodigi-made variant as the seed will template it: its Prodigi SKU + order-time
 * attributes, the print areas it fills, and its print geometry (gate dpi included). Pure — the
 * print-spec test checks these against Prodigi's own print areas without a database.
 */
export function definedPrintSpecs(): Array<{ productKey: string; sku: string; prodigiSku: string; prodigiAttrs: Record<string, string> | null; attributes: Record<string, string>; printTo: string[]; visibleInShop: boolean; template: TemplateGeom }> {
  return Object.entries(DEFS).flatMap(([productKey, def]) => {
    if (!def.print) return [];
    const defaultIndex = Math.max(0, def.variants.findIndex((v) => v.default));
    return def.variants.flatMap((v, i) =>
      v.prodigiSku
        ? [{
            productKey, sku: variantSku(productKey, v, i === defaultIndex), prodigiSku: v.prodigiSku, prodigiAttrs: v.prodigiAttrs ?? null, attributes: variantAttributes(v),
            printTo: v.printTo ?? ['default'], visibleInShop: def.visibleInShop ?? false, template: templateGeom(printTemplateOf(v)),
          }]
        : [],
    );
  });
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
    .select({ productKey: products.key, productActive: products.active, sku: productVariants.sku, label: productVariants.label, pricePence: productVariants.pricePence, unitCostPence: productVariants.unitCostPence, postFirstPence: productVariants.postFirstPence, postExtraPence: productVariants.postExtraPence, isDefault: productVariants.isDefault, variantActive: productVariants.active })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId));

  const map: PricedCatalogue = {};
  for (const r of rows) {
    if (!r.productActive || !r.variantActive) continue;
    if (BUNDLE_ONLY_SKUS.has(r.sku)) continue; // a bundle's extra packs: never sold (or priced) on their own
    const entry = { pricePence: r.pricePence, label: r.label, unitCostPence: r.unitCostPence, postFirstPence: r.postFirstPence, postExtraPence: r.postExtraPence };
    map[r.sku] = entry;
    if (r.isDefault && !Object.prototype.hasOwnProperty.call(map, r.productKey)) {
      map[r.productKey] = { ...entry };
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
  /** The variant's print canvas in mm (from its print template) — display-only truth
   * for previews (3D spin view, DPI hints). null for non-printable variants (gift wrap).
   * The print pipeline still resolves its own server-side template at order time. */
  printWmm: number | null;
  printHmm: number | null;
  /** The print template's pixel geometry — so the client runs the SAME DPI assessment
   * (assessResolution) the server's order-time gate does. null ⇒ not a printed product. */
  printGeom?: TemplateGeom | null;
  /** Its multi-buy tiers for 2, 3, 4, 5+ (basis points), derived server-side from its live costs
   * (src/pricing/multibuy.ts). All 0 ⇒ no offer. The costs themselves never leave the server. */
  multiBuyBps?: number[];
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
  /** Orientation axis (frames: portrait | landscape). Empty for single-orientation products. */
  orientations: string[];
  /** Phone cases: grade (snap | tough) and finish (gloss | matte) axes. Empty elsewhere. */
  grades: string[];
  finishes: string[];
  variants: CatalogueVariant[];
  /** Curated front-of-shop rank (1 = first). null ⇒ Full-Catalogue-only. */
  popularRank: number | null;
}

/**
 * The STOREFRONT catalogue: active products flagged {@link products.visibleInShop},
 * with their variants — for the catalogue + customise screens. `includeHidden` is the
 * curation workbench view (every active product regardless of the flag); its only
 * caller gates it to non-production.
 */
export async function loadCatalogue(db: DbHandle, opts?: { includeHidden?: boolean }): Promise<CatalogueProduct[]> {
  const visibility = opts?.includeHidden ? [] : [eq(products.visibleInShop, true)];
  const rows = await db
    .select({
      key: products.key, label: products.label, blurb: products.blurb, description: products.description, specs: products.specs, category: products.category, sortOrder: products.sortOrder, popularRank: products.popularRank,
      vId: productVariants.id, vSku: productVariants.sku, vAttrs: productVariants.attributes, vPrice: productVariants.pricePence, vDefault: productVariants.isDefault, vSort: productVariants.sortOrder,
      vCost: productVariants.unitCostPence, vPostFirst: productVariants.postFirstPence, vPostExtra: productVariants.postExtraPence,
      tWmm: printTemplates.printWidthMm, tHmm: printTemplates.printHeightMm,
      tWpx: printTemplates.printWidthPx, tHpx: printTemplates.printHeightPx, tBleed: printTemplates.bleedMm, tDpi: printTemplates.requiredDpi, tMinW: printTemplates.minSourceWidthPx,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
    .where(and(eq(products.active, true), eq(productVariants.active, true), ...visibility))
    .orderBy(asc(products.sortOrder), asc(productVariants.sortOrder));

  const byKey = new Map<string, CatalogueProduct>();
  for (const r of rows) {
    if (BUNDLE_ONLY_SKUS.has(r.vSku)) continue; // a bundle's extra packs are never offered on their own
    let p = byKey.get(r.key);
    if (!p) {
      p = { key: r.key, label: r.label, blurb: r.blurb, description: r.description, specs: (r.specs as Record<string, string>) ?? {}, category: r.category, fromPence: r.vPrice, sizes: [], colours: [], orientations: [], grades: [], finishes: [], variants: [], popularRank: r.popularRank ?? null };
      byKey.set(r.key, p);
    }
    const attrs = (r.vAttrs as Record<string, string>) ?? {};
    p.variants.push({ id: r.vId, sku: r.vSku, attributes: attrs, pricePence: r.vPrice, isDefault: r.vDefault, printWmm: r.tWmm ?? null, printHmm: r.tHmm ?? null, printGeom: r.tWpx && r.tHpx && r.tDpi ? templateGeom({ printWidthPx: r.tWpx, printHeightPx: r.tHpx, bleedMm: r.tBleed ?? 0, requiredDpi: r.tDpi, minSourceWidthPx: r.tMinW }) : null, multiBuyBps: isBundleKey(r.key) ? [0, 0, 0, 0] : multiBuyTiers(economicsOf({ pricePence: r.vPrice, unitCostPence: r.vCost, postFirstPence: r.vPostFirst, postExtraPence: r.vPostExtra }, parcelGroupOf(r.vSku) !== null)) });
    p.fromPence = Math.min(p.fromPence, r.vPrice);
    if (attrs.size && !p.sizes.includes(attrs.size)) p.sizes.push(attrs.size);
    if (attrs.colour && !p.colours.includes(attrs.colour)) p.colours.push(attrs.colour);
    if (attrs.orientation && !p.orientations.includes(attrs.orientation)) p.orientations.push(attrs.orientation);
    if (attrs.grade && !p.grades.includes(attrs.grade)) p.grades.push(attrs.grade);
    if (attrs.finish && !p.finishes.includes(attrs.finish)) p.finishes.push(attrs.finish);
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
    const visibleInShop = def.visibleInShop ?? false;
    const [product] = await db
      .insert(products)
      .values({ key, category: def.category, label: def.label, blurb: def.blurb, description: def.description, specs: def.specs, active: !def.paused, sortOrder: order, popularRank, visibleInShop })
      .onConflictDoUpdate({ target: products.key, set: { category: def.category, label: def.label, blurb: def.blurb, description: def.description, specs: def.specs, active: !def.paused, sortOrder: order, popularRank, visibleInShop } })
      .returning();

    const defaultIndex = Math.max(0, def.variants.findIndex((v) => v.default));
    const currentSkus = def.variants.map((v, i) => variantSku(key, v, i === defaultIndex));
    // Two variants on one sku would silently overwrite each other (the later wins) — fail loud.
    const dupes = currentSkus.filter((k, i) => currentSkus.indexOf(k) !== i);
    if (dupes.length) throw new Error(`[seed-catalogue] ${key}: duplicate variant skus ${[...new Set(dupes)].join(', ')}`);

    // BATCHED per product (a handful of round trips per product, not four per variant): the
    // 435-variant catalogue was ~1,800 sequential queries — over Netlify's ~26 s function limit
    // against a remote DB (the 504 on /api/jobs/seed-catalogue). Same rows, same upserts.
    const rows = def.variants.map((v, i) => {
      // A printable product without a POD SKU would seed as MANUAL and silently never
      // fulfil — that's an authoring mistake, not a configuration.
      if (def.print && !v.prodigiSku) {
        console.warn(`[seed-catalogue] printable variant ${key}/${v.size ?? ''}/${v.colour ?? ''} has NO prodigiSku — it will be MANUAL-fulfilled`);
      }
      const isDefault = i === defaultIndex;
      const attributes = variantAttributes(v);
      const label = [def.label, v.size, v.colour, v.orientation === 'landscape' ? 'landscape' : null, v.sides === 'double' ? 'double-sided' : null, v.grade, v.finish].filter(Boolean).join(' · ');
      return { v, values: { productId: product!.id, sku: currentSkus[i]!, label, attributes, pricePence: v.pricePence, isDefault, sortOrder: i, active: true } };
    });
    variantCount += rows.length;

    const upserted = await db
      .insert(productVariants)
      .values(rows.map((r) => r.values))
      .onConflictDoUpdate({
        target: productVariants.sku,
        set: {
          productId: sql`excluded.product_id`, label: sql`excluded.label`, attributes: sql`excluded.attributes`, pricePence: sql`excluded.price_pence`,
          isDefault: sql`excluded.is_default`, sortOrder: sql`excluded.sort_order`, active: true,
        },
      })
      .returning({ id: productVariants.id, sku: productVariants.sku });
    const idBySku = new Map(upserted.map((u) => [u.sku, u.id]));
    const withIds = rows.map((r) => ({ ...r, id: idBySku.get(r.values.sku)! }));

    if (def.print) {
      const tpls = withIds.map(({ v, id }) => ({ variantId: id, ...printTemplateOf(v) }));
      await db
        .insert(printTemplates)
        .values(tpls)
        .onConflictDoUpdate({
          target: printTemplates.variantId,
          set: {
            orientation: sql`excluded.orientation`, printWidthMm: sql`excluded.print_width_mm`, printHeightMm: sql`excluded.print_height_mm`,
            requiredDpi: sql`excluded.required_dpi`, printWidthPx: sql`excluded.print_width_px`, printHeightPx: sql`excluded.print_height_px`,
            bleedMm: sql`excluded.bleed_mm`, aspectMilli: sql`excluded.aspect_milli`, minSourceWidthPx: sql`excluded.min_source_width_px`,
            minSourceHeightPx: sql`excluded.min_source_height_px`,
          },
        });
    }

    // Exactly one provider row per variant: Prodigi when a live SKU is mapped (the
    // order-time attributes go in providerConfig), else MANUAL. Concurrency-safe
    // (the int suite seeds in parallel): drop any wrong-provider row (e.g. an old
    // placeholder), then upsert the correct one.
    const providers = withIds.map(({ v, id, values }) => ({
      variantId: id,
      provider: (v.prodigiSku ? 'PRODIGI' : 'MANUAL') as 'PRODIGI' | 'MANUAL',
      providerSku: v.prodigiSku ?? values.sku,
      providerConfig: v.prodigiAttrs || v.printTo ? { ...(v.prodigiAttrs ? { prodigiAttrs: v.prodigiAttrs } : {}), ...(v.printTo ? { printTo: v.printTo } : {}) } : null,
      isDefault: true,
    }));
    for (const provider of ['PRODIGI', 'MANUAL'] as const) {
      const ids = providers.filter((p) => p.provider === provider).map((p) => p.variantId);
      if (ids.length) {
        await db.delete(productVariantProviders).where(and(inArray(productVariantProviders.variantId, ids), ne(productVariantProviders.provider, provider)));
      }
    }
    await db
      .insert(productVariantProviders)
      .values(providers)
      .onConflictDoUpdate({
        target: [productVariantProviders.variantId, productVariantProviders.provider],
        set: { providerSku: sql`excluded.provider_sku`, providerConfig: sql`excluded.provider_config`, isDefault: true, active: true },
      });

    // Hide any variant of this product no longer in the DEFS (e.g. an old colour).
    await db
      .update(productVariants)
      .set({ active: false })
      .where(and(eq(productVariants.productId, product!.id), notInArray(productVariants.sku, currentSkus)));
  }

  // Retire any whole product no longer in the DEFS (e.g. the discontinued tote bag) so removing a
  // line from the catalogue actually takes it off the shelf — and clear its popular rank so it
  // can't collide with a live product's rank. Cascade to its variants so none linger active.
  await db.update(products).set({ active: false, popularRank: null, visibleInShop: false }).where(notInArray(products.key, keys)); // a retired product is never on show
  await db
    .update(productVariants)
    .set({ active: false })
    .where(inArray(productVariants.productId, db.select({ id: products.id }).from(products).where(notInArray(products.key, keys))));

  // the expected order is only the starting point — recent sales re-rank it straight away
  await recomputePopularity(db);

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
