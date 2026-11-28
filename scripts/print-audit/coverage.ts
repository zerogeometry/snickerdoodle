// PRINT AUDIT (28 Nov 2026): MEASURE, to the millimetre, how much of each print file the shop's preview shows.
//
// The preview is rendered through the shop's own code four times — with an all-white picture, an all-black
// one and two COLOUR-CODED ones (red = how far across the file, green = how far down; a coarse and a fine
// code). Every preview layer is a linear mix of the picture with the photo (multiply / alpha), so for each
// preview pixel (coded − black) ÷ (white − black) gives back the exact spot of the file it shows. The
// smallest and largest spots seen are the edges the preview reaches; the rest of the file is hidden.
// Read-only: no database, no storage, no child's image, no Prodigi call.
//
//   npx tsx --conditions=react-server scripts/print-audit/coverage.ts <out.json> [--keys mug,cushion]
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { definedPriceList, definedPrintSpecs } from '@/server/catalogue';
import { renderMockupLayers, renderTemplatePreview } from '@/server/print/compositor';
import { canvasSizePx, type Transform } from '@/server/print/geometry';
import { printFileSize } from '@/server/print/printFile';
import { authorCtx, authorTemplate, BUNDLE_BACKDROP, TILE_LAYERS } from '@/server/print/seedMockups';
import { buildLayout, decodeBundleLayout, decodeDrawing, encodeBundle, renderBundleLayers } from '@/server/print/bundleMockup';
import { buildFrameLayout, frameLayoutDir } from '@/server/print/frameLayout';
import { frameGridOf } from '@/lib/multi-photo-frame';
import { isPatternProduct } from '@/lib/patterns';

const args = process.argv.slice(2);
const ki = args.indexOf('--keys');
const keys = ki >= 0 ? args.splice(ki, 2)[1]!.split(',') : null;
const [out] = args;
if (!out) throw new Error('usage: coverage.ts <out.json> [--keys a,b]');

const FILL: Transform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
const FINE = 16;
const FACE_KEYS = new Set(['heightChart', 'calendar']); // printed faces: lay the FILE straight on (like patterns)

/** A W×H picture: kind 'coarse' codes x,y in R,G (0…255 across); 'fine' codes 16 sawtooth periods; plus flat white / black. */
async function coded(W: number, H: number, kind: 'coarse' | 'fine' | 'white' | 'black'): Promise<Buffer> {
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const fx = (x + 0.5) / W, fy = (y + 0.5) / H;
      if (kind === 'white') { px[i] = px[i + 1] = px[i + 2] = 255; continue; }
      if (kind === 'black') continue;
      const cx = kind === 'coarse' ? fx : (fx * FINE) % 1, cy = kind === 'coarse' ? fy : (fy * FINE) % 1;
      px[i] = Math.round(cx * 255); px[i + 1] = Math.round(cy * 255); px[i + 2] = 255;
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

type Render = (design: Buffer) => Promise<Buffer>;
/** Edges the preview reaches, as fractions of the file across (x) and down (y); null when no design shows. */
async function measure(render: Render, W: number, H: number) {
  const [w, k, c, f] = await Promise.all((['white', 'black', 'coarse', 'fine'] as const).map(async (kind) => {
    const img = await render(await coded(W, H, kind));
    return sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  }));
  const n = w!.info.width * w!.info.height;
  const xs: number[] = [], ys: number[] = [];
  for (let p = 0; p < n; p++) {
    const i = p * 3;
    const dR = w!.data[i]! - k!.data[i]!, dG = w!.data[i + 1]! - k!.data[i + 1]!, dB = w!.data[i + 2]! - k!.data[i + 2]!;
    if (dR < 110 || dG < 110 || dB < 110) continue; // the picture barely shows here (frame edge, shadow, mask edge)
    const nR = (c!.data[i]! - k!.data[i]!) / dR, nG = (c!.data[i + 1]! - k!.data[i + 1]!) / dG;
    const fR = (f!.data[i]! - k!.data[i]!) / dR, fG = (f!.data[i + 1]! - k!.data[i + 1]!) / dG;
    const join = (coarse: number, fine: number) => (Math.round(coarse * FINE - fine) + Math.min(1, Math.max(0, fine))) / FINE;
    const x = join(nR, fR), y = join(nG, fG);
    // the coarse and fine codes must agree (lossy WebP rings at the fine code's jumps) — else skip the pixel
    if (Math.abs(x - nR) > 0.02 || Math.abs(y - nG) > 0.02) continue;
    if (x < -0.005 || x > 1.005 || y < -0.005 || y > 1.005) continue;
    xs.push(x); ys.push(y);
  }
  if (xs.length < 50) return null;
  // ignore the stray few (a handful of mis-decoded pixels): the 0.02% at each end
  const q = (a: number[], lo: boolean) => { a.sort((m, n2) => m - n2); const k2 = Math.min(a.length - 1, Math.floor(a.length * 0.0002)); return Math.min(1, Math.max(0, lo ? a[k2]! : a[a.length - 1 - k2]!)); };
  return { x0: q(xs, true), x1: q(xs, false), y0: q(ys, true), y1: q(ys, false), count: xs.length };
}

const prices = definedPriceList();
const specs = definedPrintSpecs();
const ctx = authorCtx();
const seen = new Set<string>();
const results: unknown[] = [];
for (const v of prices) {
  const s = specs.find((x) => x.sku === v.sku);
  if (!s || !v.px || (keys && !keys.includes(v.productKey))) continue;
  const a0 = v.attributes;
  // one per distinct picture + print shape (finishes share a case, tee colours share a size's placement)
  const sig = JSON.stringify([v.productKey, a0.size, a0.orientation, a0.sides, a0.grade, ['framedPrint', 'mug', 'blanket', 'multiPhotoFrame'].includes(v.productKey) ? a0.colour : null, s.prodigiSku.startsWith('WRAP-KFT') ? 'kraft' : '']);
  if (seen.has(sig)) continue;
  seen.add(sig);
  const canvas = canvasSizePx(s.template);
  const file = printFileSize(v.productKey, a0, s.template);
  const mmPerPx = 25.4 / v.dpi;
  const scale = Math.min(1, 1600 / Math.max(canvas.width, canvas.height));
  // the multi photo frame shows ONE square drawing in every window: code a square, and read how much of each window's tile shows
  const square = v.productKey === 'multiPhotoFrame';
  const W = square ? 800 : Math.max(64, Math.round(canvas.width * scale)), H = square ? 800 : Math.max(64, Math.round(canvas.height * scale));
  const print = { widthPx: v.px.w, heightPx: v.px.h, bleedMm: v.bleedMm, requiredDpi: v.dpi };
  const row: Record<string, unknown> = { key: v.productKey, sku: v.sku, prodigiSku: s.prodigiSku, attrs: a0, visible: v.visibleInShop, paused: v.paused, file, canvasMm: { w: +(canvas.width * mmPerPx).toFixed(1), h: +(canvas.height * mmPerPx).toFixed(1) }, bleedMm: v.bleedMm, views: {} as Record<string, unknown> };
  const views = row.views as Record<string, unknown>;
  try {
    if (v.productKey === 'placemat' || v.productKey === 'coaster' || v.productKey === 'multiPhotoFrame') {
      let layout: Awaited<ReturnType<typeof decodeBundleLayout>>;
      if (v.productKey === 'multiPhotoFrame') {
        const grid = frameGridOf(a0.size, a0.orientation);
        const dir = grid ? frameLayoutDir(grid) : null;
        if (!dir) throw new Error('frame layers not staged');
        const built = await buildFrameLayout(dir, a0.colour!, BUNDLE_BACKDROP);
        layout = await decodeBundleLayout(built.base, built.regions, 2048);
      } else {
        const layers = TILE_LAYERS[v.productKey];
        const m = await sharp(layers[0]!.file).metadata();
        const built = await buildLayout(layers, [m.width!, m.height!], BUNDLE_BACKDROP);
        layout = await decodeBundleLayout(built.base, built.regions, 2048);
      }
      const render: Render = async (d) => (await encodeBundle(await renderBundleLayers(layout, await decodeDrawing(d).then((dd) => () => dd), v.productKey === 'multiPhotoFrame' ? undefined : FILL))).buffer;
      views.tile = await measure(render, W, H);
      row.mode = 'layout tile (each square / mat shows the drawing — not the print file itself)';
    } else {
      const a = await authorTemplate({ sku: v.sku, key: v.productKey, attrs: a0, printWmm: v.mm.w, printHmm: v.mm.h, printWpx: v.px.w, printHpx: v.px.h }, ctx);
      if ('skip' in a) throw new Error(`template skipped: ${a.skip}`);
      const t = a.template;
      row.mode = a.registration.mode;
      const meta = await sharp(t.blank).metadata();
      const workEdge = Math.max(meta.width!, meta.height!);
      const face = isPatternProduct(v.productKey) || FACE_KEYS.has(v.productKey);
      if (v.productKey === 'mug') {
        for (const mode of ['front', 'back'] as const) {
          views[mode] = await measure(async (d) => (await renderMockupLayers({ blank: t.blank, mask: t.mask, overlay: t.overlay, design: d, quad: t.printQuad, transform: FILL, workEdge, outputEdge: 1400, print, materialClass: t.materialClass, mugMode: mode })).buffer, W, H);
        }
        if (a.centre) {
          const cm = await sharp(a.centre.blank).metadata();
          views.centre = await measure(async (d) => (await renderMockupLayers({ blank: a.centre!.blank, mask: a.centre!.mask, design: d, quad: a.centre!.printQuad, transform: FILL, workEdge: Math.max(cm.width!, cm.height!), outputEdge: 1400, print, materialClass: a.centre!.materialClass, mugMode: 'centre' })).buffer, W, H);
        }
      } else if (face) {
        views.file = await measure(async (d) => (await renderMockupLayers({ blank: t.blank, mask: t.mask, overlay: t.overlay, design: d, quad: t.printQuad, extraQuads: t.extraQuads, transform: FILL, workEdge, outputEdge: 1400, print: { ...print, bleedMm: 0 }, materialClass: t.materialClass })).buffer, W, H);
      } else {
        views.preview = await measure((d) => renderTemplatePreview({ blank: t.blank, mask: t.mask, overlay: t.overlay, quad: t.printQuad, extraQuads: t.extraQuads, materialClass: t.materialClass, design: d, productKey: v.productKey, transform: FILL, size: 'zoom', print }), W, H);
      }
    }
    // in mm hidden from each edge of the DESIGN CANVAS (the file before any turn to Prodigi's way up)
    const slotMm = square ? 60 : 0;
    const cw = square ? slotMm : canvas.width * mmPerPx, ch = square ? slotMm : canvas.height * mmPerPx;
    row.hiddenMm = Object.fromEntries(Object.entries(views).map(([k, m]) => {
      const r = m as { x0: number; x1: number; y0: number; y1: number } | null;
      return [k, r ? { left: +(r.x0 * cw).toFixed(1), right: +((1 - r.x1) * cw).toFixed(1), top: +(r.y0 * ch).toFixed(1), bottom: +((1 - r.y1) * ch).toFixed(1) } : null];
    }));
  } catch (e) {
    row.error = (e as Error).message;
  }
  results.push(row);
  console.log(v.sku.padEnd(44), JSON.stringify(row.hiddenMm ?? row.error));
  writeFileSync(out, JSON.stringify(results, null, 1));
}
console.log(`measured ${results.length} preview shapes → ${out}`);
