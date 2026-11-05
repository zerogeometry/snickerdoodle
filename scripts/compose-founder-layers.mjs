// Composes the founder's cut-out product photos into LAYERED mockup sets the seeder reads
// (.prodigi-assets/blanks/layered/<product>/) — the same construction as the frames, cushions and
// blanket: our cream backdrop, a soft contact shadow, the product photo, the print area, and the
// on-top detail (a sock heel, a folded corner, a paper curl). Everything lands on one 2000×2000
// canvas, the product filling ~80% of it like the rest of the range.
//
// Inputs (cut-outs, no background or shadow) live in .prodigi-assets/blanks/founder-raw/ — the whole
// tree is gitignored, like every product photo. Re-run whenever a photo changes:
//   node scripts/compose-founder-layers.mjs
// A set whose photos aren't in founder-raw yet is skipped (and says so) — drop them in and re-run.
// (FOUNDER_LAYERS_ROOT=<dir> composes from <dir>/founder-raw into <dir>/layered instead — for tests.)
//
// GARMENTS (the baby + toddler tees and the bodysuits, 5 Nov 2026) are composed PER COLOUR into
// layered/<product>/<colour>/ — the seeder picks the variant's own colour. Supply ONE cut-out of the garment
// (ideally WHITE, laid flat, front-on) + its print area on the same canvas; every colour is made from it by
// tinting (the folds and texture kept, like the tee photos). A real photo of a colour, <product>-<colour>.png
// (e.g. baby-tee-light-blue.png, same canvas), is used instead of the tint whenever it's there.
//
// Per product folder it writes:
//   background.png  the shared brand backdrop (copied from the blanket set, so every tile matches)
//   shadow.png      soft + contact shadow drawn from the product's own outline
//   product.png     the photo — the compositor multiplies fabric art over it, so knit/cotton
//                   texture and folds read through the print
//   printmap.png    white where the print goes (its alpha = print area + silhouette mask)
//   overlay.png     optional detail laid OVER the art (heel / folded corner / roll curl)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = process.env.FOUNDER_LAYERS_ROOT ? path.resolve(process.env.FOUNDER_LAYERS_ROOT) : path.join(process.cwd(), '.prodigi-assets', 'blanks');
const RAW = path.join(ROOT, 'founder-raw');
const OUT = path.join(ROOT, 'layered');
const BACKGROUND = process.env.FOUNDER_LAYERS_ROOT ? path.join(ROOT, 'background.png') : path.join(OUT, 'blanket', 'white', 'background.png');
const CANVAS = 2000;

/**
 * fill   — the product's longest side as a share of the canvas.
 * rotate — turn the whole set first (none need it today).
 * printmap — a separate print-area file; omitted ⇒ the product's own outline is the print area.
 */
const SETS = [
  { out: 'socks/ankle', product: 'ankle-socks.png', overlay: 'ankle-socks-heel.png', fill: 0.8 },
  { out: 'socks/tube', product: 'tube-socks.png', fill: 0.82 },
  // LANDSCAPE, as photographed (founder) — its print is designed landscape (DESIGNED_TURNED)
  { out: 'teaTowel', product: 'tea-towel.png', overlay: 'tea-towel-fold.png', fill: 0.82 },
  { out: 'wrappingPaper', product: 'wrapping-paper-flat.png', overlay: 'wrapping-paper-roll.png', fill: 0.82 },
  { out: 'playingCards', product: 'playing-cards-base.png', printmap: 'playing-cards-print.png', fill: 0.8 },
  // ── Christmas (founder, 26 Oct) ──
  // the calendar: the hanging calendar, its top page is the print area
  { out: 'calendar', product: 'calendar.png', printmap: 'calendar-print.png', fill: 0.82 },
  // the sack laid flat: Prodigi's print panel is 320×500 mm on a 483 mm-wide sack, just above the bottom
  // seam — measured off the sack in the photo (no separate print map)
  { out: 'sack', product: 'sack.png', sackPanel: { sackWidthMm: 483, panelMm: { w: 320, h: 500 }, bottomInsetFrac: 0.06 }, fill: 0.84 },
  // ceramic disc: the print area IS the disc (glossy white under the art); the edge blur, then the gold
  // string, go on top
  { out: 'bauble/ceramic', productFromPrintmap: true, printmap: 'ceramic-print.png', overlays: ['ceramic-edgeblur.png', 'ceramic-string.png'], fill: 0.72 },
  // plastic ball: the print area is the ball; the glass highlights + chrome cap + string go on top
  { out: 'bauble/ball', productFromPrintmap: true, printmap: 'bauble-print.png', overlays: ['bauble-overlay.png'], fill: 0.8 },
  // ── the Apple Watch strap (5 Nov 2026), one set per size: laid out straight and flat, the buckle half on top,
  // the watch face-up between the halves. print = the two leather halves only (what Prodigi prints); the watch,
  // buckle and keeper loop ride on top as the overlay. The seeder spreads the print file over both halves, the
  // middle of it hidden behind the watch — as on the real strap (src/lib/watch-strap.ts).
  { out: 'watchStrap/small', product: 'watch-strap-small.png', printmap: 'watch-strap-small-print.png', overlay: 'watch-strap-small-watch.png', fill: 0.86 },
  { out: 'watchStrap/large', product: 'watch-strap-large.png', printmap: 'watch-strap-large-print.png', overlay: 'watch-strap-large-watch.png', fill: 0.86 },
];

/** The garments, composed once per colour (see the note at the top). `colours` come from src/lib/garments.ts. */
const GARMENT_SETS = [
  { out: 'babyTee', product: 'baby-tee.png', printmap: 'baby-tee-print.png', fill: 0.8 },
  { out: 'toddlerTee', product: 'toddler-tee.png', printmap: 'toddler-tee-print.png', fill: 0.82 },
  { out: 'babyBodysuit', product: 'baby-bodysuit.png', printmap: 'baby-bodysuit-print.png', fill: 0.82 },
  { out: 'babyBodysuitShort', product: 'baby-bodysuit-short.png', printmap: 'baby-bodysuit-short-print.png', fill: 0.82 },
];

/** Load as RGBA raw, turned if asked. */
async function load(file, rotate) {
  const img = sharp(path.join(RAW, file)).ensureAlpha();
  const { data, info } = await (rotate ? img.rotate(rotate) : img).raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

/** Drop specks: alpha islands smaller than `minArea` px (stray pixels left by the cut-out). */
function despeckle({ data, W, H }, minArea = 400) {
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || data[start * 4 + 3] <= 8) continue;
    const island = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      island.push(i);
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && !seen[j] && data[j * 4 + 3] > 8) { seen[j] = 1; stack.push(j); }
      }
    }
    if (island.length < minArea) for (const i of island) data[i * 4 + 3] = 0;
  }
  return { data, W, H };
}

function alphaBox({ data, W, H }) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Cut `box` out of a layer, scale it, and place it on the transparent canvas at (left, top). */
async function place(layer, box, scale, left, top) {
  const cut = await sharp(layer.data, { raw: { width: layer.W, height: layer.H, channels: 4 } })
    .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 })
    .resize(Math.round((box.x1 - box.x0) * scale), Math.round((box.y1 - box.y0) * scale), { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cut, left, top }])
    .png()
    .toBuffer();
}

async function alphaOf(png) {
  return sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();
}

/** A soft drop shadow + a tight contact shadow from the outline (black, real transparency). */
async function shadowFrom(alpha) {
  // extractChannel(0): sharp may hand a blurred 1-channel raw back with more channels.
  const blurred = async (sigma) => {
    const b = await sharp(alpha, { raw: { width: CANVAS, height: CANVAS, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
    if (b.length !== CANVAS * CANVAS) throw new Error(`shadow blur returned ${b.length} bytes, expected ${CANVAS * CANVAS}`);
    return b;
  };
  const [soft, contact] = await Promise.all([blurred(26), blurred(6)]);
  const passes = [
    { a: soft, dx: 10, dy: 22, k: 0.26 },
    { a: contact, dx: 2, dy: 5, k: 0.2 },
  ];
  const out = Buffer.alloc(CANVAS * CANVAS * 4); // rgb stays 0 (black)
  for (let y = 0; y < CANVAS; y++)
    for (let x = 0; x < CANVAS; x++) {
      let clear = 1;
      for (const p of passes) {
        const sx = x - p.dx, sy = y - p.dy;
        if (sx < 0 || sy < 0 || sx >= CANVAS || sy >= CANVAS) continue;
        clear *= 1 - (p.a[sy * CANVAS + sx] / 255) * p.k;
      }
      out[(y * CANVAS + x) * 4 + 3] = Math.round((1 - clear) * 255);
    }
  return sharp(out, { raw: { width: CANVAS, height: CANVAS, channels: 4 } }).png().toBuffer();
}

/** White where the source is opaque, with the source's alpha. */
async function whiteFrom(png) {
  const a = await alphaOf(png);
  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: '#ffffff' } })
    .joinChannel(a, { raw: { width: CANVAS, height: CANVAS, channels: 1 } })
    .png()
    .toBuffer();
}

/** Layers stacked in order onto one (an edge blur, then a string on top of it). */
async function stack(files, rotate) {
  const layers = await Promise.all(files.map((f) => load(f, rotate)));
  const { W, H } = layers[0];
  const out = Buffer.from(layers[0].data);
  for (const l of layers.slice(1)) {
    if (l.W !== W || l.H !== H) throw new Error('overlays must share one canvas');
    for (let i = 0; i < W * H; i++) {
      const a = l.data[i * 4 + 3] / 255, b = out[i * 4 + 3] / 255;
      const o = a + b * (1 - a);
      for (let c = 0; c < 3; c++) out[i * 4 + c] = o ? Math.round((l.data[i * 4 + c] * a + out[i * 4 + c] * b * (1 - a)) / o) : 0;
      out[i * 4 + 3] = Math.round(o * 255);
    }
  }
  return { data: out, W, H };
}

/** The print map's shape, as a glossy-white product (a ceramic disc / plastic ball under the art). */
function whiteShape({ data, W, H }) {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 248; out[i * 4 + 1] = 247; out[i * 4 + 2] = 244; out[i * 4 + 3] = data[i * 4 + 3]; }
  return { data: out, W, H };
}

/** The sack's print panel at true scale: measure the bag's body width (across 70 % of its height, below
 * the drawstrings), turn mm into px, centre the panel and sit it bottomInsetFrac above the bottom. */
async function sackPanel(productPng, spec) {
  const a = await alphaOf(productPng);
  let y0 = CANVAS, y1 = -1;
  for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) if (a[y * CANVAS + x] > 128) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
  const row = Math.round(y0 + (y1 - y0) * 0.7);
  let bx0 = CANVAS, bx1 = -1;
  for (let x = 0; x < CANVAS; x++) if (a[row * CANVAS + x] > 128) { if (x < bx0) bx0 = x; bx1 = x; }
  const pxPerMm = (bx1 - bx0 + 1) / spec.sackWidthMm;
  const w = Math.round(spec.panelMm.w * pxPerMm), h = Math.round(spec.panelMm.h * pxPerMm);
  const cx = (bx0 + bx1) / 2;
  const bottom = Math.round(y1 - (y1 - y0) * spec.bottomInsetFrac);
  const left = Math.round(cx - w / 2), top = bottom - h;
  const rect = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: rect, left, top }]).png().toBuffer();
}

/** A garment photo turned to `hex`: its brightness (against its own bright fabric) multiplies the colour, so
 * folds and texture survive; transparency is kept. On a white photo, white is a no-op. */
function tint({ data, W, H }, hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const ls = [];
  for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] > 200) ls.push(lum(i * 4));
  ls.sort((x, y) => x - y);
  const ref = Math.max(1, ls[Math.floor(ls.length * 0.9)] ?? 255); // the fabric's own bright, not a stray highlight
  const out = Buffer.from(data);
  for (let i = 0; i < W * H; i++) {
    const k = Math.min(1.08, lum(i * 4) / ref);
    out[i * 4] = Math.min(255, Math.round(r * k));
    out[i * 4 + 1] = Math.min(255, Math.round(g * k));
    out[i * 4 + 2] = Math.min(255, Math.round(b * k));
  }
  return { data: out, W, H };
}

const has = (f) => existsSync(path.join(RAW, f));
/** The raw files a set needs (all must be there, or it's skipped). */
const needs = (set) => [set.product, set.printmap, set.overlay, ...(set.overlays ?? [])].filter((f) => f && !(set.productFromPrintmap && f === set.product));

if (!existsSync(BACKGROUND)) throw new Error(`brand backdrop missing: ${BACKGROUND}`);
for (const set of SETS) {
  const missing = needs(set).filter((f) => !has(f));
  if (missing.length) { console.log(`${set.out.padEnd(14)} skipped — waiting for ${missing.join(', ')} in ${RAW}`); continue; }
  await compose(set, set.out);
}

const { GARMENT_COLOURS_BY_PRODUCT, colourSlug } = await import(pathToFileURL(path.join(process.cwd(), 'src', 'lib', 'garments.ts')).href);
for (const set of GARMENT_SETS) {
  const missing = needs(set).filter((f) => !has(f));
  if (missing.length) { console.log(`${set.out.padEnd(14)} skipped — waiting for ${missing.join(', ')} in ${RAW}`); continue; }
  const base = despeckle(await load(set.product, set.rotate));
  for (const c of GARMENT_COLOURS_BY_PRODUCT[set.out]) {
    // a real photo of this colour wins; otherwise the one photo, tinted
    const own = set.product.replace(/\.png$/, `-${colourSlug(c.name)}.png`);
    const product = has(own) ? despeckle(await load(own, set.rotate)) : tint(base, c.hex);
    await compose(set, path.join(set.out, colourSlug(c.name)), product);
  }
}

async function compose(set, out, preloaded) {
  const printmap = set.printmap ? despeckle(await load(set.printmap, set.rotate)) : null;
  const product = preloaded ?? (set.productFromPrintmap ? whiteShape(printmap) : despeckle(await load(set.product, set.rotate)));
  const overlay = set.overlays ? await stack(set.overlays, set.rotate) : set.overlay ? despeckle(await load(set.overlay, set.rotate)) : null;
  for (const l of [overlay, printmap]) {
    if (l && (l.W !== product.W || l.H !== product.H)) throw new Error(`${set.out}: layers must share one canvas`);
  }

  // Frame on the union of everything visible (the overlay can poke past the product, e.g. a curl).
  const boxes = [alphaBox(product), overlay && alphaBox(overlay)].filter(Boolean);
  const box = { x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)), x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)) };
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const scale = (set.fill * CANVAS) / Math.max(bw, bh);
  const left = Math.round((CANVAS - bw * scale) / 2);
  const top = Math.round((CANVAS - bh * scale) / 2 - CANVAS * 0.01); // a hair above centre, room for the shadow

  const productPng = await place(product, box, scale, left, top);
  const overlayPng = overlay ? await place(overlay, box, scale, left, top) : null;
  const printmapPng = set.sackPanel
    ? await sackPanel(productPng, set.sackPanel)
    : printmap ? await whiteFrom(await place(printmap, box, scale, left, top)) : await whiteFrom(productPng);

  // Shadow from everything that sits on the table: the product, plus the overlay where it overhangs.
  const pa = await alphaOf(productPng);
  if (overlayPng) {
    const oa = await alphaOf(overlayPng);
    for (let i = 0; i < pa.length; i++) pa[i] = Math.max(pa[i], oa[i]);
  }
  const shadowPng = await shadowFrom(pa);

  const dir = path.join(OUT, out);
  mkdirSync(dir, { recursive: true });
  copyFileSync(BACKGROUND, path.join(dir, 'background.png'));
  await sharp(productPng).toFile(path.join(dir, 'product.png'));
  await sharp(printmapPng).toFile(path.join(dir, 'printmap.png'));
  await sharp(shadowPng).toFile(path.join(dir, 'shadow.png'));
  if (overlayPng) await sharp(overlayPng).toFile(path.join(dir, 'overlay.png'));
  console.log(`${out.padEnd(14)} product ${Math.round(bw * scale)}×${Math.round(bh * scale)} at (${left}, ${top})${set.rotate ? ` · turned ${set.rotate}°` : ''}${overlay ? ' · overlay' : ''}${printmap ? ' · own print area' : ''}`);
}
