// Turns founder-made product photos on a flat cream backdrop into web-ready cut-outs for the
// marketing pages: the backdrop becomes transparent and the product's drop shadow becomes a
// real (semi-transparent) shadow, so it sits naturally on kraft, paper or a polaroid.
//
//   node scripts/cutout-examples.mjs <srcDir> <outDir> name1=src1.webp name2=src2.webp …
//
// Method: flood-fill from the image border through "backdrop-like" pixels — a pixel whose
// colour is the backdrop colour scaled by some brightness k (i.e. backdrop or its shadow).
// Those become black with alpha = 1 − k (shadow) or 0 (backdrop). Everything else (the
// product) stays opaque. Then trim, and save a ≤900px WebP with alpha.

import path from 'node:path';
import sharp from 'sharp';

const [srcDir, outDir, ...pairs] = process.argv.slice(2);
const MAX = 900;

for (const pair of pairs) {
  const [name, file] = pair.split('=');
  const img = sharp(path.join(srcDir, file)).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x, y) => (y * W + x) * 4;

  // backdrop colour = median-ish of the four corners
  const corners = [px(3, 3), px(W - 4, 3), px(3, H - 4), px(W - 4, H - 4)];
  const bg = [0, 1, 2].map((c) => corners.reduce((n, i) => n + data[i + c], 0) / corners.length);
  const bgSum = bg[0] + bg[1] + bg[2];

  /** brightness ratio k if the pixel is backdrop/shadow-coloured, else null */
  const backdropK = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const k = (r + g + b) / bgSum;
    if (k > 1.04 || k < 0.45) return null;
    const dr = r - bg[0] * k, dg = g - bg[1] * k, db = b - bg[2] * k;
    return Math.hypot(dr, dg, db) < 9 + 6 * (1 - k) ? k : null;
  };

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
  for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = y * W + x;
    if (seen[p]) continue;
    const i = p * 4;
    const k = backdropK(i);
    if (k === null) continue;
    seen[p] = 1;
    // shadow → soft black; pure backdrop → transparent
    const a = Math.max(0, Math.min(1, (1 - k) * 1.6));
    data[i] = data[i + 1] = data[i + 2] = 40; // warm-ish ink so the shadow isn't grey on kraft
    data[i + 3] = Math.round(a * 255);
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  const out = path.join(outDir, `${name}.webp`);
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84, alphaQuality: 90, effort: 5 })
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`${name}: ${meta.width}×${meta.height}`);
}
