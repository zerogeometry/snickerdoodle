// Generates every install / home-screen icon (PWA, Android maskable, iOS apple-touch) from ONE
// source — so when the founder's hi-res logo arrives, a single command regenerates the lot:
//
//   node scripts/make-icons.mjs                        # today: derived from public/brand/snickerlogo.png
//   node scripts/make-icons.mjs path/to/face-mark.svg  # the founder's hi-res SVG (or a ≥1024px PNG)
//
// A source passed in should be the smiley-face mark ON ITS OWN (no wordmark), transparent or on a
// plain light background. Without one, the face is cut out of the 1440×478 lockup (the "rays" are
// erased so the mark matches the favicon) — only ~480px tall, so the 512px icons are barely
// upscaled but are NOT print-crisp: regenerate them from the hi-res original (flagged, D12).
//
// Writes to public/brand/: icon-192.png, icon-512.png, icon-maskable-192.png,
// icon-maskable-512.png and apple-touch-icon.png (180).

import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'brand');
// brand token (src/app/globals.css @theme) — paper for the icon tile
const PAPER = { r: 0xff, g: 0xfb, b: 0xf2, alpha: 1 };

/** The face mark as a trimmed, transparent RGBA buffer. */
async function faceMark(src) {
  if (src) {
    const img = sharp(src, { density: 600 }).ensureAlpha();
    return img.trim({ threshold: 12 }).png().toBuffer();
  }
  // Derive from the lockup: crop the face, erase the tan "rays" outside the head circle.
  const { data, info } = await sharp(path.join(OUT, 'snickerlogo.png'))
    .extract({ left: 0, top: 0, width: 620, height: 478 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cx = 350;
  const cy = 270;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const tan = r > 120 && r - b > 50 && r > g; // the caramel rays (the outline is dark cocoa)
      const outside = Math.hypot(x - cx, y - cy) > 206;
      // the rays sit up and to the left of the head (clear of the ear and the curl): wipe that
      // corner outside the head entirely, so no anti-aliased ghost of them is left behind
      const rayCorner = x < 215 && y < 262;
      if (outside && (tan || rayCorner)) data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: info }).trim({ threshold: 12 }).png().toBuffer();
}

/** The mark centred on a square paper tile, filling `fill` of the side. */
async function tile(mark, size, fill, background = PAPER) {
  const inner = Math.round(size * fill);
  const resized = await sharp(mark).resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: 'centre' }])
    .flatten({ background })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const src = process.argv[2] ? path.resolve(process.argv[2]) : null;
const mark = await faceMark(src);
const meta = await sharp(mark).metadata();
const outputs = {
  'icon-192.png': await tile(mark, 192, 0.84),
  'icon-512.png': await tile(mark, 512, 0.84),
  // maskable: the platform crops to a circle/squircle — keep the mark inside the 80% safe zone
  'icon-maskable-192.png': await tile(mark, 192, 0.62),
  'icon-maskable-512.png': await tile(mark, 512, 0.62),
  // iOS rounds the corners itself and ignores transparency — an opaque paper tile
  'apple-touch-icon.png': await tile(mark, 180, 0.8),
};
for (const [name, buf] of Object.entries(outputs)) await sharp(buf).toFile(path.join(OUT, name));
console.log(`icons written to public/brand from ${src ?? 'snickerlogo.png (derived)'} — mark ${meta.width}×${meta.height}px`);
if (!src && Math.max(meta.width ?? 0, meta.height ?? 0) < 1024) {
  console.log('⚠ low-res source: regenerate with the founder’s hi-res logo — node scripts/make-icons.mjs <logo.svg>');
}
