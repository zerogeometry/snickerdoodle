// Composes the founder's cut-out product photos into LAYERED mockup sets the seeder reads
// (.prodigi-assets/blanks/layered/<product>/) — the same construction as the frames, cushions and
// blanket: our cream backdrop, a soft contact shadow, the product photo, the print area, and the
// on-top detail (a sock heel, a folded corner, a paper curl). Everything lands on one 2000×2000
// canvas, the product filling ~80% of it like the rest of the range.
//
// Inputs (cut-outs, no background or shadow) live in .prodigi-assets/blanks/founder-raw/ — the whole
// tree is gitignored, like every product photo. Re-run whenever a photo changes:
//   node scripts/compose-founder-layers.mjs
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
import sharp from 'sharp';

const ROOT = path.join(process.cwd(), '.prodigi-assets', 'blanks');
const RAW = path.join(ROOT, 'founder-raw');
const OUT = path.join(ROOT, 'layered');
const BACKGROUND = path.join(OUT, 'blanket', 'white', 'background.png');
const CANVAS = 2000;

/**
 * fill   — the product's longest side as a share of the canvas.
 * rotate — turn the whole set first (the tea towel's print file is PORTRAIT; the photo is landscape).
 * printmap — a separate print-area file; omitted ⇒ the product's own outline is the print area.
 */
const SETS = [
  { out: 'socks/ankle', product: 'ankle-socks.png', overlay: 'ankle-socks-heel.png', fill: 0.8 },
  { out: 'socks/tube', product: 'tube-socks.png', fill: 0.82 },
  { out: 'teaTowel', product: 'tea-towel.png', overlay: 'tea-towel-fold.png', rotate: 90, fill: 0.82 },
  { out: 'wrappingPaper', product: 'wrapping-paper-flat.png', overlay: 'wrapping-paper-roll.png', fill: 0.82 },
  { out: 'playingCards', product: 'playing-cards-base.png', printmap: 'playing-cards-print.png', fill: 0.8 },
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

if (!existsSync(BACKGROUND)) throw new Error(`brand backdrop missing: ${BACKGROUND}`);
for (const set of SETS) {
  const product = despeckle(await load(set.product, set.rotate));
  const overlay = set.overlay ? despeckle(await load(set.overlay, set.rotate)) : null;
  const printmap = set.printmap ? despeckle(await load(set.printmap, set.rotate)) : null;
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
  const printmapPng = printmap ? await whiteFrom(await place(printmap, box, scale, left, top)) : await whiteFrom(productPng);

  // Shadow from everything that sits on the table: the product, plus the overlay where it overhangs.
  const pa = await alphaOf(productPng);
  if (overlayPng) {
    const oa = await alphaOf(overlayPng);
    for (let i = 0; i < pa.length; i++) pa[i] = Math.max(pa[i], oa[i]);
  }
  const shadowPng = await shadowFrom(pa);

  const dir = path.join(OUT, set.out);
  mkdirSync(dir, { recursive: true });
  copyFileSync(BACKGROUND, path.join(dir, 'background.png'));
  await sharp(productPng).toFile(path.join(dir, 'product.png'));
  await sharp(printmapPng).toFile(path.join(dir, 'printmap.png'));
  await sharp(shadowPng).toFile(path.join(dir, 'shadow.png'));
  if (overlayPng) await sharp(overlayPng).toFile(path.join(dir, 'overlay.png'));
  console.log(`${set.out.padEnd(14)} product ${Math.round(bw * scale)}×${Math.round(bh * scale)} at (${left}, ${top})${set.rotate ? ` · turned ${set.rotate}°` : ''}${overlay ? ' · overlay' : ''}${printmap ? ' · own print area' : ''}`);
}
