import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { printTemplates, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { definedPrintSpecs, seedCatalogue, DESIGNED_TURNED, PRODIGI_NATIVE_ORIENTATION } from '@/server/catalogue';
import { renderPrintFile } from '@/server/print/render';
import { canvasSizePx, computeLayerRect, galleryRect, isGalleryProduct, templateGeom, type TemplateGeom, type Transform } from '@/server/print/geometry';
import { heightChartArtGeom, heightChartLayout, isHeightChart } from '@/server/print/height-chart-geometry';
import { CARD_PANEL_X, CARD_SPREAD } from '@/server/print/cardPrint';
import { isPatternProduct } from '@/lib/patterns';
import { DTG_GARMENT_KEYS } from '@/server/print/apparel';
import { deleteObject, derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { DbHandle } from '@/server/db';
import fixture from '@/server/__tests__/fixtures/prodigi-print-areas.json';

/**
 * TEST SWEEP 03 (29 Oct 2026) — print output accuracy against Prodigi's templates.
 *
 * For one variant of EVERY distinct print geometry in the catalogue (product × Prodigi SKU × file px ×
 * orientation × sides; phone cases by px), the REAL print file is made through the order-time render
 * (renderPrintFile) from a brand-safe CALIBRATION grid with five coloured markers, at known placements,
 * and checked: px exactly Prodigi's printAreaSizes (fixture = sandbox GET /v4.0/products), PNG, sRGB,
 * opaque (garments: see-through by design), no blank edge where the art should cover, and every marker
 * lands where the on-screen positioner draws it (Positioner.tsx imgStyle: an <img> of the pre-rotation
 * size centred on computeLayerRect's box, CSS-rotated about its centre) — turned back 90° clockwise on a
 * file Prodigi holds in the other orientation. The preview maths below is written out independently of
 * the renderer on purpose: it is the CSS the browser applies, not render.ts's sharp pipeline.
 */

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const REPORT = process.env.SWEEP03_OUT; // optional: write the results table (JSON) here
const SHOTS = process.env.SWEEP03_SHOTS; // optional: save a small JPEG of each print file here (evidence)

type Fixture = { products: Record<string, { printAreas: string[]; variants: Array<{ attributes: Record<string, string>; printAreaSizes: Record<string, { w: number; h: number }> }> } | null> };
const prodigi = (fixture as Fixture).products;

// ── the calibration image ────────────────────────────────────────────────────
const CAL = { w: 3000, h: 2250 };
const BG = [250, 230, 150] as const; // a light honey ground — so a white (unprinted) edge shows
const MARKERS = {
  tl: { u: 0.12, v: 0.12, rgb: [230, 30, 30] },
  tr: { u: 0.88, v: 0.12, rgb: [30, 170, 60] },
  br: { u: 0.88, v: 0.88, rgb: [30, 60, 220] },
  bl: { u: 0.12, v: 0.88, rgb: [200, 40, 200] },
  c: { u: 0.5, v: 0.5, rgb: [20, 20, 20] },
} as const;
type MarkerName = keyof typeof MARKERS;
const MARK_SIDE = 200;

async function calibration(swap: Partial<Record<MarkerName, readonly number[]>> = {}): Promise<Buffer> {
  const grid: string[] = [];
  for (let x = 150; x < CAL.w; x += 150) grid.push(`<rect x="${x - 2}" y="0" width="4" height="${CAL.h}" fill="rgb(170,170,170)"/>`);
  for (let y = 150; y < CAL.h; y += 150) grid.push(`<rect x="0" y="${y - 2}" width="${CAL.w}" height="4" fill="rgb(170,170,170)"/>`);
  const marks = (Object.keys(MARKERS) as MarkerName[]).map((k) => {
    const m = MARKERS[k];
    const rgb = swap[k] ?? m.rgb;
    return `<rect x="${m.u * CAL.w - MARK_SIDE / 2}" y="${m.v * CAL.h - MARK_SIDE / 2}" width="${MARK_SIDE}" height="${MARK_SIDE}" fill="rgb(${rgb.join(',')})"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CAL.w}" height="${CAL.h}"><rect width="100%" height="100%" fill="rgb(${BG.join(',')})"/>${grid.join('')}${marks.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── the on-screen positioner's maths (Positioner.tsx imgStyle), in canvas px ─────────────────────
/** Where the browser draws source point (u,v) (0..1 of the ORIGINAL drawing) on the placement canvas. */
function previewPoint(t: TemplateGeom, src: { width: number; height: number }, tf: Transform, u: number, v: number): [number, number] {
  const r = computeLayerRect(t, src, tf);
  const swap = tf.rotationDeg % 180 !== 0;
  const imgW = swap ? r.height : r.width; // the <img>'s pre-rotation size
  const imgH = swap ? r.width : r.height;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const dx = (u - 0.5) * imgW, dy = (v - 0.5) * imgH;
  const a = (tf.rotationDeg * Math.PI) / 180; // CSS rotate(): clockwise on screen (y down)
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** The print file's frame: where a placement-canvas point lands in the FILE Prodigi gets. */
interface FileFrame {
  /** the placement geometry the positioner resolves against */
  place: TemplateGeom;
  /** placement-canvas → design-canvas offset (height chart ruler band, card panel, calendar margin) */
  dx: number;
  dy: number;
  /** the design canvas size (before a 90° turn back to Prodigi) */
  cw: number;
  ch: number;
  /** turned 90° clockwise to Prodigi's orientation */
  turn: boolean;
}
function toFile(f: FileFrame, p: [number, number]): [number, number] {
  const x = p[0] + f.dx, y = p[1] + f.dy;
  return f.turn ? [f.ch - y, x] : [x, y];
}

// ── reading the print file back ─────────────────────────────────────────────
const ANALYSE_MAX = 1400;
async function analyse(png: Buffer) {
  const meta = await sharp(png).metadata();
  const W = meta.width!, H = meta.height!;
  const k = Math.min(1, ANALYSE_MAX / Math.max(W, H));
  const { data, info } = await sharp(png).flatten({ background: '#ffffff' }).resize(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)), { fit: 'fill', kernel: 'nearest' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => {
    const i = (y * info.width + x) * 3;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  /** the centroid of one marker colour, searched right of `xMin` (file px — a height chart's ruler is black too) */
  const centroid = (rgb: readonly number[], xMin = 0, xMax = W): [number, number] | null => {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < info.height; y++) for (let x = Math.ceil(xMin * k); x < Math.min(info.width, Math.floor(xMax * k)); x++) {
      const p = px(x, y);
      if (Math.abs(p[0]! - rgb[0]!) + Math.abs(p[1]! - rgb[1]!) + Math.abs(p[2]! - rgb[2]!) < 60) { sx += x; sy += y; n++; }
    }
    return n < 4 ? null : [(sx / n + 0.5) / k, (sy / n + 0.5) / k];
  };
  const minAlpha = meta.hasAlpha ? (await sharp(png).stats()).channels[3]!.min : 255;
  const isWhite = (x: number, y: number) => px(Math.min(info.width - 1, Math.max(0, Math.round(x * k))), Math.min(info.height - 1, Math.max(0, Math.round(y * k)))).every((c) => c >= 250);
  return { meta, W, H, k, centroid, isWhite, minAlpha };
}

// ── the variants to render: one per distinct print geometry ─────────────────
type Spec = ReturnType<typeof definedPrintSpecs>[number];
function prodigiSize(s: Spec): { w: number; h: number } | null {
  const want = Object.entries(s.prodigiAttrs ?? {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()] as const);
  const area = s.printTo[0] ?? 'default';
  const sizes = new Set<string>();
  for (const v of prodigi[s.prodigiSku]?.variants ?? []) {
    const a = Object.fromEntries(Object.entries(v.attributes).map(([k, x]) => [k.toLowerCase(), String(x).toLowerCase()]));
    if (want.every(([k, x]) => !(k in a) || a[k] === x) && v.printAreaSizes[area]) sizes.add(`${v.printAreaSizes[area]!.w}x${v.printAreaSizes[area]!.h}`);
  }
  if (sizes.size !== 1) return null;
  const [w, h] = [...sizes][0]!.split('x').map(Number);
  return { w: w!, h: h! };
}
const turnedFile = (s: Spec) => DESIGNED_TURNED.has(s.productKey) || (!!s.attributes.orientation && s.attributes.orientation !== (PRODIGI_NATIVE_ORIENTATION[s.productKey] ?? 'portrait'));
const KNOWN_SPLIT = new Set(['adultHoodie']); // print-spec.test KNOWN: Prodigi's area differs by colour+size — hidden from the shop
const WRAP = (s: Spec) => s.productKey === 'wrappingPaper';

const all = definedPrintSpecs();
const picked = new Map<string, Spec>();
for (const s of all) {
  const g = s.template;
  const key = s.productKey === 'phoneCase'
    ? `phoneCase|${g.printWidthPx}x${g.printHeightPx}`
    : `${s.productKey}|${s.prodigiSku}|${g.printWidthPx}x${g.printHeightPx}|${s.attributes.orientation ?? ''}|${s.attributes.sides ?? ''}`;
  // dark garments make a different (firm-edged) file — render one light and one dark of each garment
  const dark = DTG_GARMENT_KEYS.has(s.productKey) && /black|navy|dark|bottle|red|green|heather|grey/.test(s.attributes.colour ?? '') ? '|dark' : '';
  if (!picked.has(key + dark)) picked.set(key + dark, s);
}
const targets = [...picked.values()].filter((s) => !WRAP(s));
const wraps = [...picked.values()].filter(WRAP);

const PLACEMENTS: Array<{ name: string; tf: Transform }> = [
  { name: 'fit', tf: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } },
  { name: 'zoom+pan', tf: { scale: 1.5, offsetX: 0.4, offsetY: -0.3, rotationDeg: 0 } },
  { name: 'rot90', tf: { scale: 1.2, offsetX: -0.5, offsetY: 0.2, rotationDeg: 90 } },
  { name: 'rot270-fill', tf: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 270 } },
];

interface Row {
  product: string; sku: string; prodigiSku: string; area: string; prodigiPx: string; templatePx: string; filePx: string;
  format: string; space: string; channels: number; minAlpha: number; density: number | undefined; preview: string; maxMarkerErrPx: number; edges: string; verdict: string; note?: string;
}
const rows: Row[] = [];

describe.skipIf(!DB || !S3)('sweep 03 — the real print file for every print geometry (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let assetId = '';
  let designObjectId = '';
  const keys: string[] = [];
  const assetIds: string[] = [];
  let src = { width: 0, height: 0 };
  const variantIdBySku = new Map<string, string>();
  const tplByVariant = new Map<string, TemplateGeom>();

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    for (const v of await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants)) variantIdBySku.set(v.sku, v.id);
    for (const t of await db.select().from(printTemplates)) tplByVariant.set(t.variantId, templateGeom(t));
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await calibration(), keptInHome: true });
    assetId = ing.assetId;
    assetIds.push(assetId);
    keys.push(ing.key);
    const meta = await sharp(await getObjectBytes(ing.key)).metadata();
    src = { width: meta.width!, height: meta.height! };
    // A STUDIO EDIT: the 'design' derivative the Studio saves (studio-doc.ts) — the same grid with the
    // centre marker turned cobalt, so a print made from it is told apart from one made from the original.
    const design = await calibration({ c: [47, 93, 168] });
    const dKey = derivativeKey(assetId, 'design');
    await putObject(dKey, design, 'image/png');
    keys.push(dKey);
    const [row] = await db.insert(storageObjects).values({ assetId, objectClass: 'DERIVATIVE', bucket: getS3().bucket, key: dKey, contentType: 'image/png', byteSize: design.byteLength, sha256: createHash('sha256').update(design).digest('hex'), exifStripped: true, writeOnce: false }).returning();
    designObjectId = row!.id;
  }, 120_000);

  afterAll(async () => {
    if (assetIds.length && db) {
      const objs = await db.select({ key: storageObjects.key }).from(storageObjects).where(inArray(storageObjects.assetId, assetIds));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client?.end();
    if (REPORT) {
      mkdirSync(REPORT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
      writeFileSync(REPORT, JSON.stringify(rows, null, 1));
    }
  });

  function frameOf(s: Spec, t: TemplateGeom): FileFrame {
    const c = canvasSizePx(t);
    if (isHeightChart(s.productKey)) return { place: heightChartArtGeom(t), dx: heightChartLayout(c, t.requiredDpi).bandPx, dy: 0, cw: c.width, ch: c.height, turn: false };
    if (s.productKey === 'card' || s.productKey === 'cardPack') {
      // the print places the design on the 1530×2160 outer-front PANEL (cardPrint.ts placeDesign), but the
      // positioner places it on the variant's TEMPLATE canvas — compare in the panel's px, scaled
      return { place: t, dx: CARD_PANEL_X.outerFront, dy: 0, cw: CARD_SPREAD.widthPx, ch: CARD_SPREAD.heightPx, turn: false };
    }
    return { place: t, dx: 0, dy: 0, cw: c.width, ch: c.height, turn: turnedFile(s) };
  }

  it('the calibration drawing went in at its full size (no resize on ingest)', () => {
    expect(src).toEqual({ width: CAL.w, height: CAL.h });
  });

  for (const s of targets) {
    it(`${s.sku} (${s.prodigiSku}) — exact px, format, no blank edge, preview = print`, async () => {
      const variantId = variantIdBySku.get(s.sku)!;
      expect(variantId, `${s.sku} seeded`).toBeTruthy();
      const t = tplByVariant.get(variantId)!;
      const want = prodigiSize(s);
      const pattern = isPatternProduct(s.productKey);
      const gallery = isGalleryProduct(s.productKey);
      const garment = DTG_GARMENT_KEYS.has(s.productKey);
      const card = s.productKey === 'card' || s.productKey === 'cardPack';
      const f = frameOf(s, t);
      let maxErr = 0;
      const problems: string[] = [];
      let last: Awaited<ReturnType<typeof analyse>> | null = null;
      const places = pattern || gallery ? PLACEMENTS.slice(0, 1) : PLACEMENTS;
      for (const p of places) {
        const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
        let res: Awaited<ReturnType<typeof renderPrintFile>>;
        try {
          res = await renderPrintFile(db, sam, { assetId, variantId, transform: p.tf });
        } catch (e) {
          // 03-B3: a big print zoomed in makes an intermediate layer over sharp's 268 MP input limit
          problems.push(`${p.name}: render failed — ${(e as Error).message}${/pixel limit/.test((e as Error).message) ? ' [03-B3]' : ''}`);
          continue;
        }
        const png = await getObjectBytes(res.key);
        const a = await analyse(png);
        last = a;
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true });
          await sharp(png).flatten({ background: '#ffffff' }).resize(560, 560, { fit: 'inside' }).jpeg({ quality: 72 }).toFile(`${SHOTS}/${s.sku}--${p.name}.jpg`);
        }
        // the file's px are what the render says, and exactly Prodigi's
        expect([a.W, a.H], `${p.name}: reported size`).toEqual([res.widthPx, res.heightPx]);
        if (want && !KNOWN_SPLIT.has(s.productKey)) expect([a.W, a.H], `${p.name}: Prodigi ${want.w}×${want.h}`).toEqual([want.w, want.h]);
        expect(a.meta.format).toBe('png');
        expect(a.meta.space).toBe('srgb');
        if (garment) expect(a.meta.channels, 'a garment prints from a see-through file').toBe(4);
        else expect(a.minAlpha, 'opaque — no transparent pixel anywhere').toBe(255);
        if (pattern) continue;
        // where the positioner draws each marker vs where it is in the file
        const fileTf = { ...p.tf };
        const expAt = (u: number, v: number): [number, number] => {
          let pt: [number, number];
          if (gallery) {
            const r = galleryRect(t, src);
            pt = [canvasSizePx(t).bleedPx + r.x + u * r.width, canvasSizePx(t).bleedPx + r.y + v * r.height];
          } else {
            pt = previewPoint(f.place, src, fileTf, u, v);
            if (card) {
              // positioner canvas → the print panel, proportionally (what the shopper sees is the template's shape)
              const c = canvasSizePx(t);
              pt = [(pt[0] / c.width) * (CARD_SPREAD.widthPx / 4), (pt[1] / c.height) * CARD_SPREAD.heightPx];
            }
          }
          return toFile(f, pt);
        };
        // the region the design may be seen in: the whole file, the art beside a height chart's ruler, a card's front panel
        // a double-sided cushion is [front | back], both faces the same drawing here — look at the front
        const dual = s.attributes.sides === 'double';
        const [x0, x1] = dual ? [0, a.W / 2] : card ? [CARD_PANEL_X.outerFront, CARD_PANEL_X.outerFront + CARD_SPREAD.widthPx / 4] : [isHeightChart(s.productKey) ? f.dx : 0, a.W];
        for (const name of Object.keys(MARKERS) as MarkerName[]) {
          const m = MARKERS[name];
          const exp = expAt(m.u, m.v);
          // compare only a marker WHOLLY on the print (a half-cropped one's centroid is biased)
          const hu = MARK_SIDE / 2 / CAL.w, hv = MARK_SIDE / 2 / CAL.h;
          const corners = [expAt(m.u - hu, m.v - hv), expAt(m.u + hu, m.v - hv), expAt(m.u + hu, m.v + hv), expAt(m.u - hu, m.v + hv)];
          const inside = corners.every(([x, y]) => x > x0 + 2 && x < x1 - 2 && y > 2 && y < a.H - 2);
          const got = a.centroid(m.rgb, x0 + 2, x1 - 2); // only where the design can be (not a ruler, a logo or a cushion's back face)
          if (!inside) continue; // cropped off by this placement — nothing to compare
          if (!got) {
            problems.push(`${p.name}: ${name} marker missing (expected at ${exp.map(Math.round).join(',')})`);
            continue;
          }
          const err = Math.hypot(got[0] - exp[0], got[1] - exp[1]);
          const tol = Math.max(6, 0.006 * Math.max(a.W, a.H)); // ≤0.6% of the long side (+ the analysis resample)
          maxErr = Math.max(maxErr, err / Math.max(a.W, a.H));
          if (err > tol) problems.push(`${p.name}: ${name} at ${got.map(Math.round).join(',')} but the preview puts it at ${exp.map(Math.round).join(',')} (${((100 * err) / Math.max(a.W, a.H)).toFixed(2)}% of the long side)`);
        }
        // no blank (white) edge where a zoomed-in drawing covers the whole print area
        if (p.name === 'zoom+pan' && !gallery && !garment) {
          const edge = card
            ? [[CARD_PANEL_X.outerFront + 3, 3], [CARD_PANEL_X.outerFront + 1526, 3], [CARD_PANEL_X.outerFront + 3, 2156], [CARD_PANEL_X.outerFront + 1526, 2156]]
            : isHeightChart(s.productKey)
              ? [[f.dx + 3, 3], [a.W - 3, 3], [f.dx + 3, a.H - 3], [a.W - 3, a.H - 3]]
              : [[2, 2], [a.W - 3, 2], [2, a.H - 3], [a.W - 3, a.H - 3], [a.W / 2, 2], [2, a.H / 2]];
          const blank = edge.filter(([x, y]) => a.isWhite(x!, y!));
          if (blank.length) problems.push(`zoom+pan: white (unprinted) at ${blank.map((e) => e.map(Math.round).join(',')).join(' · ')}`);
        }
      }
      if (!last) throw new Error(`no placement rendered: ${problems.join(' | ')}`);
      rows.push({
        product: s.productKey, sku: s.sku, prodigiSku: s.prodigiSku, area: s.printTo.join('+'),
        prodigiPx: want ? `${want.w}×${want.h}` : 'differs by route', templatePx: `${t.printWidthPx}×${t.printHeightPx}${t.bleedMm ? ` +${t.bleedMm}mm bleed` : ''}`,
        filePx: `${last!.W}×${last!.H}`, format: last!.meta.format!, space: last!.meta.space!, channels: last!.meta.channels!, minAlpha: last!.minAlpha, density: last!.meta.density,
        preview: pattern ? 'n/a (repeat pattern)' : problems.length ? 'NO' : 'yes', maxMarkerErrPx: Math.round(maxErr * 10000) / 100,
        edges: problems.some((x) => x.includes('white')) ? 'blank edge' : 'ok',
        verdict: problems.length || (want && `${want.w}×${want.h}` !== `${last!.W}×${last!.H}`) ? 'FAIL' : 'PASS', note: problems.join(' | ') || undefined,
      });
      // a card's preview/print shape difference is recorded (03-B2), not failed here
      // (03-B3 — a big zoomed print refusing to render — is fixed, so a render failure fails here too)
      if (!card) expect(problems).toEqual([]);
    }, 600_000);
  }

  // BUG 03-B3 (P1): a paid order the renderer can't make. The 24×32″ frame zoomed to 1.5× (the
  // positioner allows 4×; the DPI gate passes it as UPSCALE) draws the layer at 19200×14400 px, which
  // render.ts:217 re-reads with sharp's default 268 MP input limit → "Input image exceeds pixel limit"
  // → RENDER_FAILED after payment. Fixed: the window is cut from the source before resizing (visibleLayer.ts).
  it('03-B3: the 24×32″ frame renders at a 1.5× zoom', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const variantId = variantIdBySku.get('framedPrint-2432-gold')!;
    const res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1.5, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    expect([res.widthPx, res.heightPx]).toEqual([7200, 9600]);
  }, 300_000);

  // BUG 03-B1 via the PREVIEW: the positioner's "preview the exact print file" (actions/render.ts) calls
  // renderPrintFile too, writing the SAME key an order's print file lives at — so previewing another
  // placement of a drawing replaces the bytes of an already-rendered (or submitted) order's file.
  it('03-B1: a later render of the same drawing + variant leaves an earlier print file untouched', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const variantId = variantIdBySku.get('mug')!;
    const order = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    const before = createHash('sha256').update(await getObjectBytes(order.key)).digest('hex');
    await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 2, offsetX: -1, offsetY: 1, rotationDeg: 180 } }); // a preview
    const after = createHash('sha256').update(await getObjectBytes(order.key)).digest('hex');
    expect(after).toBe(before);
  }, 300_000);

  // …and the positioner's real preview (actions/render.ts passes `preview: true`) writes its own slot,
  // never an order file; two lines that differ only in their card message get two files too.
  it('03-B1: the preview has its own slot; an order file is keyed by everything that prints', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const mug = variantIdBySku.get('mug')!;
    const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const order = await renderPrintFile(db, sam, { assetId, variantId: mug, transform: tf });
    const before = createHash('sha256').update(await getObjectBytes(order.key)).digest('hex');
    const preview = await renderPrintFile(db, sam, { assetId, variantId: mug, transform: { ...tf, scale: 2 }, preview: true });
    expect(preview.key).toMatch(/\/printpreview-/);
    expect(preview.key).not.toBe(order.key);
    expect(createHash('sha256').update(await getObjectBytes(order.key)).digest('hex')).toBe(before);
    // the very same inputs → the very same file (a calendar's pages, the same gift twice)
    expect((await renderPrintFile(db, sam, { assetId, variantId: mug, transform: tf })).key).toBe(order.key);
    // a card: another message, or the other span → its own file (a card never prints another's words)
    const card = variantIdBySku.get('card')!;
    const c1 = await renderPrintFile(db, sam, { assetId, variantId: card, transform: tf, message: { greeting: 'dear gran', message: '', signature: '', note: '' } });
    const c2 = await renderPrintFile(db, sam, { assetId, variantId: card, transform: tf, message: { greeting: 'dear grandad', message: '', signature: '', note: '' } });
    const c3 = await renderPrintFile(db, sam, { assetId, variantId: card, transform: tf, message: { greeting: 'dear gran', message: '', signature: '', note: '' }, cardSpan: 'full' });
    expect(new Set([c1.key, c2.key, c3.key]).size).toBe(3);
  }, 300_000);

  it('Studio edits are what prints: a render from the saved design derivative carries the edit, not the original', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const variantId = variantIdBySku.get('framedPrint')!;
    const tf = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } as const;
    const res = await renderPrintFile(db, sam, { assetId, variantId, transform: tf, sourceObjectId: designObjectId });
    const a = await analyse(await getObjectBytes(res.key));
    expect(a.centroid([47, 93, 168]), 'the Studio-edited (cobalt) centre is printed').not.toBeNull();
    expect(a.centroid(MARKERS.c.rgb), 'the original black centre is not').toBeNull();
  }, 300_000);

  // BUG 03-B4 (P1): the 3 m and 5 m KRAFT rolls (8280×35430 / 8280×59070 px, 293 / 489 MP) are over sharp's
  // default 268 MP input limit — pattern.ts creates the full-size canvas, so EVERY order of them fails to
  // render ("Input image exceeds pixel limit"), whatever the drawing or placement. Fixed: the limit is lifted
  // to exactly the template's canvas (pattern.ts).
  const B4 = new Set(['wrappingPaper-3mroll-kraft', 'wrappingPaper-5mroll-kraft']);
  for (const s of wraps) {
    it(`${B4.has(s.sku) ? '03-B4: ' : ''}${s.sku} (${s.prodigiSku}) — the repeat-pattern roll renders at Prodigi's exact px`, async () => {
      const variantId = variantIdBySku.get(s.sku)!;
      const want = prodigiSize(s)!;
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const started = Date.now();
      let res: Awaited<ReturnType<typeof renderPrintFile>> | null = null;
      let err: string | null = null;
      try {
        res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
      } catch (e) {
        err = (e as Error).message;
      }
      const bytes = res ? await getObjectBytes(res.key) : null;
      const meta = bytes ? await sharp(bytes, { limitInputPixels: false }).metadata() : null;
      rows.push({
        product: s.productKey, sku: s.sku, prodigiSku: s.prodigiSku, area: s.printTo.join('+'), prodigiPx: `${want.w}×${want.h}`,
        templatePx: `${s.template.printWidthPx}×${s.template.printHeightPx}`, filePx: meta ? `${meta.width}×${meta.height}` : `render failed: ${err}`,
        format: meta?.format ?? '-', space: meta?.space ?? '-', channels: meta?.channels ?? 0, minAlpha: -1, density: meta?.density, preview: 'n/a (repeat pattern)', maxMarkerErrPx: 0, edges: 'n/a',
        verdict: meta && meta.width === want.w && meta.height === want.h ? 'PASS' : 'FAIL', note: `render ${((Date.now() - started) / 1000).toFixed(0)}s, ${bytes ? (bytes.byteLength / 1e6).toFixed(1) : '-'} MB`,
      });
      expect(err).toBeNull();
      expect([meta!.width, meta!.height]).toEqual([want.w, want.h]);
      expect(meta!.format).toBe('png');
    }, 900_000);
  }
});

// keep the variant picker honest: every product with a print geometry is covered above
describe('sweep 03 — the render list covers every printed product', () => {
  it('one variant of every printed product is rendered', () => {
    const products = new Set(all.map((s) => s.productKey));
    const covered = new Set([...picked.values()].map((s) => s.productKey));
    expect([...products].filter((p) => !covered.has(p))).toEqual([]);
  });
});
