// Generates every install / home-screen icon (PWA, Android maskable, iOS apple-touch) and the
// social-share (Open Graph) card from ONE source — so when the founder's hi-res logo arrives, a
// single command regenerates the lot:
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
// icon-maskable-512.png, apple-touch-icon.png (180), and og-image.png (1200×630).

import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'brand');
// brand tokens (src/app/globals.css @theme) — paper for the icon tile, oat for the share card
const PAPER = { r: 0xff, g: 0xfb, b: 0xf2, alpha: 1 };
const OAT = { r: 0xeb, g: 0xdd, b: 0xc6, alpha: 1 };

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

async function ogImage() {
  const W = 1200;
  const H = 630;
  const logo = await sharp(path.join(OUT, 'snickerlogo.png')).resize({ width: 620 }).png().toBuffer();
  // two founder-made keepsakes (already on the public landing page), as taped polaroids
  const shot = async (file, rot) => {
    const img = await sharp(path.join(ROOT, 'public', 'examples', 'range', file)).resize(300, 300, { fit: 'contain', background: { r: 0xf6, g: 0xee, b: 0xdf, alpha: 1 } }).flatten({ background: '#F6EEDF' }).png().toBuffer();
    const card = await sharp({ create: { width: 330, height: 360, channels: 4, background: '#FFFFFF' } })
      .composite([
        { input: img, left: 15, top: 15 },
        { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="330" height="360"><rect x="125" y="0" width="80" height="22" fill="#F6C445" fill-opacity=".85"/></svg>`), left: 0, top: 0 },
      ])
      .png()
      .toBuffer();
    return sharp(card).rotate(rot, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  };
  const [a, b] = await Promise.all([shot('framed-print.webp', -5), shot('heart-cushion.webp', 6)]);
  const scribble = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><path d="M70 470 C200 440, 330 500, 470 462 S640 430, 660 470" fill="none" stroke="#C8402A" stroke-width="12" stroke-linecap="round"/></svg>`,
  );
  return sharp({ create: { width: W, height: H, channels: 4, background: OAT } })
    .composite([
      { input: scribble, left: 0, top: 0 },
      { input: logo, left: 50, top: 200 },
      { input: a, left: 650, top: 90 },
      { input: b, left: 870, top: 170 },
    ])
    .flatten({ background: OAT })
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
  'og-image.png': await ogImage(),
};
for (const [name, buf] of Object.entries(outputs)) await sharp(buf).toFile(path.join(OUT, name));
console.log(`icons written to public/brand from ${src ?? 'snickerlogo.png (derived)'} — mark ${meta.width}×${meta.height}px`);
if (!src && Math.max(meta.width ?? 0, meta.height ?? 0) < 1024) {
  console.log('⚠ low-res source: regenerate with the founder’s hi-res logo — node scripts/make-icons.mjs <logo.svg>');
}
