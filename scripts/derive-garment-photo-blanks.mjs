// Derives WHITE garment blanks from Prodigi's own coloured product packshots
// (.prodigi-assets/blanks/prodigi-garment-photos/ — photography from prodigi.com's
// product pages for the exact SKUs we sell through their API, the same licensing
// posture as every other Prodigi blank we stage).
//
// The founder's call (2026-07-07): garments use a STANDARD FLAT PHOTO, artwork
// composited in 2D — no drawn silhouettes, no 3D garments. A saturated packshot
// converts to a photographic white garment by taking its dominant colour channel
// as luminance (blue tee → blue channel; red bodysuit → red channel): the fabric's
// real fold shading survives, the background stays white.
//
// Output → .prodigi-assets/blanks/derived/{tee,bodysuit}-photo.png, cropped to the
// garment + margin so the seeder's canvas-frame chest regions are DETERMINISTIC
// (no white-on-white detection). Prints the measured chest-region fractions that
// seed-mockups/route.ts hardcodes — re-run this script if the sources change.
//
// COLOURED tees: the same packshot re-coloured per garment colour (src/lib/garments.ts) — the
// fold shading is kept as a multiplier on the fabric colour, the background stays white, so every
// colour a parent picks is previewed on a real tee shape. Approximate until the Stanley/Stella
// colour packshots are in hand (to-do: project-office/todo/PRODIGI-APPAREL-CHECKS.md).
//
// Run: npx tsx scripts/derive-garment-photo-blanks.mjs   (tsx: it reads the garment colours)

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ADULT_TEE_COLOURS, KIDS_TEE_COLOURS } from '../src/lib/garments.ts';

const SRC = path.join(process.cwd(), '.prodigi-assets', 'blanks', 'prodigi-garment-photos');
const OUT = path.join(process.cwd(), '.prodigi-assets', 'blanks', 'derived');
mkdirSync(OUT, { recursive: true });

/** Garment pixels on the COLOURED source: dominant channel clearly above the others. */
async function measure(file, dominant, others) {
  const { data, info } = await sharp(path.join(SRC, file)).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  const isGarment = (i) => {
    const d = data[i + dominant];
    return others.every((o) => d > data[i + o] + 25);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (isGarment((y * W + x) * C)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  // Fabric tone from the CENTRAL chest band (where the print sits) — the whole-garment
  // median is skewed by the packshot's lighting gradient (bright shoulders).
  const values = [];
  for (let y = Math.round(y0 + 0.35 * (y1 - y0)); y < y0 + 0.7 * (y1 - y0); y += 2)
    for (let x = Math.round(x0 + 0.38 * (x1 - x0)); x < x0 + 0.62 * (x1 - x0); x += 2) {
      const i = (y * W + x) * C;
      if (isGarment(i)) values.push(data[i + dominant]);
    }
  values.sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)] ?? 200;
  // torso width: measured across a row at 65% of garment height (below the sleeves)
  const yT = Math.round(y0 + 0.65 * (y1 - y0));
  let tx0 = W, tx1 = 0;
  for (let x = 0; x < W; x++) if (isGarment((yT * W + x) * C)) { if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; }
  return { W, H, bbox: { x0, y0, x1, y1 }, torso: { x0: tx0, x1: tx1 }, median };
}

/**
 * Derive the white blank: dominant channel as luminance (+lift), crop to garment
 * + margin, and report the chest-region fractions of the CROPPED canvas.
 */
async function derive({ file, out, dominant, others, printWmm, torsoMm, panelTopFrac, colours = [], transparent = false }) {
  const m = await measure(file, dominant, others);
  const bw = m.bbox.x1 - m.bbox.x0;
  const bh = m.bbox.y1 - m.bbox.y0;
  const margin = Math.round(0.07 * Math.max(bw, bh));
  const left = Math.max(0, m.bbox.x0 - margin);
  const top = Math.max(0, m.bbox.y0 - margin);
  const width = Math.min(m.W - left, bw + 2 * margin);
  const height = Math.min(m.H - top, bh + 2 * margin);

  // Normalise to WHITE-garment tones from the measured chest-fabric median: fabric →
  // ~246 with fold contrast softened to natural white-cotton depth (a fold 40 below
  // the median lands ~224). Bright areas + background clip to pure white.
  const a = 0.55;
  const b = 246 - a * m.median;
  // (no tint: sharp's fixed pipeline order lets tint() re-normalise away the linear
  // lift — and a neutral white garment is what we want anyway)
  // Soft garment mask from the coloured source (dominant channel clearly above the others).
  const { data, info } = await sharp(path.join(SRC, file)).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const mask = Buffer.alloc(W * H);
  for (let k = 0; k < W * H; k++) {
    const i = k * C;
    const d = data[i + dominant];
    const gap = Math.min(...others.map((o) => d - data[i + o]));
    mask[k] = Math.max(0, Math.min(255, Math.round(((gap - 10) / 30) * 255)));
  }
  const blurred = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const mc = blurred.info.channels; // sharp may hand back more than one channel — read the first
  const softMask = (k) => blurred.data[k * mc];

  const grey = await sharp(path.join(SRC, file)).extractChannel(dominant).linear(a, b).raw().toBuffer({ resolveWithObject: true });
  if (transparent) {
    // SEE-THROUGH around the garment, so mockups can overlap (the family set picture)
    const gc = grey.info.channels;
    const rgba = Buffer.alloc(W * H * 4);
    for (let k = 0; k < W * H; k++) {
      const v = grey.data[k * gc];
      rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = v;
      rgba[k * 4 + 3] = softMask(k);
    }
    await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).extract({ left, top, width, height }).png().toFile(path.join(OUT, out));
  } else {
    await sharp(grey.data, { raw: { width: W, height: H, channels: grey.info.channels } }).extract({ left, top, width, height }).png().toFile(path.join(OUT, out));
  }

  // Coloured versions: garment mask from the coloured source (soft-edged), fold shading as a
  // multiplier around the chest median (contrast softened), the target colour times that —
  // with a little lift toward white on highlights so dark fabric still reads its folds.
  if (colours.length) {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const c of colours) {
      if (c.name === 'white') continue;
      const T = [1, 3, 5].map((o) => parseInt(c.hex.slice(o, o + 2), 16));
      const heather = c.name.includes('heather');
      const ch3 = transparent ? 4 : 3;
      const outBuf = Buffer.alloc(W * H * ch3);
      for (let k = 0; k < W * H; k++) {
        const i = k * C;
        const sh = 1 + ((data[i + dominant] / m.median) - 1) * 0.85;
        const s1 = Math.max(0.45, Math.min(1.3, sh));
        const fleck = heather ? (rand() - 0.5) * 34 : 0;
        const a = softMask(k) / 255;
        for (let ch = 0; ch < 3; ch++) {
          let v = T[ch] * Math.min(1, s1) + (255 - T[ch]) * Math.max(0, s1 - 1) * 0.5 + fleck;
          v = Math.max(0, Math.min(255, v));
          outBuf[k * ch3 + ch] = transparent ? Math.round(v) : Math.round(v * a + 255 * (1 - a));
        }
        if (transparent) outBuf[k * ch3 + 3] = Math.round(a * 255);
      }
      const slug = c.name.replace(/\s+/g, '-');
      await sharp(outBuf, { raw: { width: W, height: H, channels: ch3 } })
        .extract({ left, top, width, height })
        .png()
        .toFile(path.join(OUT, out.replace('.png', `-${slug}.png`)));
    }
  }

  // Chest region in cropped-canvas fractions: the print canvas width at its TRUE
  // physical ratio to the measured torso (printWmm / torsoMm), centred on the torso.
  const torsoPx = m.torso.x1 - m.torso.x0;
  const torsoCx = (m.torso.x0 + m.torso.x1) / 2 - left;
  const panelW = (printWmm / torsoMm) * torsoPx;
  const panelTop = m.bbox.y0 - top + panelTopFrac * bh;
  const region = {
    x0: (torsoCx - panelW / 2) / width,
    y0: panelTop / height,
    x1: (torsoCx + panelW / 2) / width,
    y1: (panelTop + panelW * 1.15) / height, // roomy; the seeder aspect-locks the canvas inside
  };
  const r4 = (n) => Math.round(n * 1000) / 1000;
  console.log(`${out}: ${width}x${height}  torso ${torsoPx}px  region { x0: ${r4(region.x0)}, y0: ${r4(region.y0)}, x1: ${r4(region.x1)}, y1: ${r4(region.y1)} }`);
  // → src/lib/garments.ts TEE_PHOTO (the size-true preview regions are computed from these)
  console.log(`  TEE_PHOTO = { torsoFrac: ${r4(torsoPx / width)}, centreX: ${r4(torsoCx / width)}, panelTop: ${r4(panelTop / height)}, aspect: ${r4(width / height)} }`);
}

// Kids/adult tee — Mini Creator blue flat packshot; kids 3-4y torso 330mm carries the
// 260mm print (78.8%). The adult tee shares the blank (same silhouette family).
await derive({
  file: 'mini-creator-blue-flat.webp', out: 'tee-photo.png',
  dominant: 2, others: [0],
  printWmm: 260, torsoMm: 330, panelTopFrac: 0.24,
  colours: [...KIDS_TEE_COLOURS, ...ADULT_TEE_COLOURS.filter((a) => !KIDS_TEE_COLOURS.some((k) => k.name === a.name))],
  transparent: true,
});
// Baby bodysuit — LAT 4411 red flat packshot; NB torso ≈190mm carries the 180mm print
// capped at 80% (pending Rabbit Skins chart / Prodigi support confirmation).
await derive({
  file: 'lat-4411-red-flat.webp', out: 'bodysuit-photo.png',
  dominant: 0, others: [1, 2],
  printWmm: 152, torsoMm: 190, panelTopFrac: 0.22,
});
