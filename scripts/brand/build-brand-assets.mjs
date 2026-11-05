/**
 * Builds every logo + icon file the site ships from the founder's two masters:
 *   node scripts/brand/build-brand-assets.mjs <SD-logo-original.png> [favicon.png]
 * The lockup master (6336×2688, transparent) gives the header logo, the share card, the badges AND
 * the icon face (cropped from it, so install icons are crisp at 512px — the founder's favicon.png is
 * only 200px and is used for nothing bigger than its own size).
 * Writes into public/brand, src/app/favicon.ico and the print card-back badge. Re-run after a new master.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [logoSrc, faviconSrc] = process.argv.slice(2);
if (!logoSrc) throw new Error('usage: build-brand-assets.mjs <SD-logo-original.png> [favicon.png]');
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BRAND = path.join(ROOT, 'public', 'brand');
mkdirSync(BRAND, { recursive: true });

// Brand tokens (src/app/globals.css @theme) — the icon/OG backgrounds.
const OAT = { r: 0xf8, g: 0xf5, b: 0xe9, alpha: 1 };
const PAPER = { r: 0xff, g: 0xfb, b: 0xf2, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const out = (name) => path.join(BRAND, name);
const say = async (file) => {
  const m = await sharp(file).metadata();
  console.log(`${path.relative(ROOT, file)}  ${m.width}×${m.height}  ${(m.size ?? 0) / 1000 || ''}`);
};

// 1. The lockup, trimmed to its ink (the master carries ~5% clear padding all round).
const lockup = await sharp(logoSrc).trim({ threshold: 1 }).png().toBuffer();
const lm = await sharp(lockup).metadata();

// 2. The face: everything left of the clear gap between the face and the wordmark.
const raw = await sharp(lockup).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: LW, height: LH } = raw.info;
const colInk = (x) => {
  for (let y = 0; y < LH; y++) if (raw.data[(y * LW + x) * 4 + 3] > 40) return true;
  return false;
};
let gap = 0;
for (let x = Math.round(LW * 0.25), run = 0; x < LW * 0.6; x++) {
  run = colInk(x) ? 0 : run + 1;
  if (run > LW * 0.02) {
    gap = x - run;
    break;
  }
}
if (!gap) throw new Error('could not find the gap between the face and the wordmark');
const face = await sharp(lockup).extract({ left: 0, top: 0, width: gap, height: LH }).trim({ threshold: 1 }).png().toBuffer();
const fm = await sharp(face).metadata();

/** The face centred on a square of `size`, filling `fill` of it, on `bg`. */
async function faceIcon(size, fill, bg) {
  const box = Math.round(size * fill);
  const f = await sharp(face).resize(box, box, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: f, gravity: 'centre' }]);
}

// ── header logo: one webp sized for the tallest header (56px) at 3× ─────────────────────────────────
const LOGO_H = 168;
await sharp(lockup).resize({ height: LOGO_H, kernel: 'lanczos3' }).webp({ quality: 86, alphaQuality: 88, effort: 6, smartSubsample: true }).toFile(out('snickerdoodle-logo.webp'));
await say(out('snickerdoodle-logo.webp'));
// a PNG of the lockup (structured-data logo, emails, anywhere webp isn't welcome)
await sharp(lockup).resize({ width: 1200, kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 95 }).toFile(out('snickerlogo.png'));
await say(out('snickerlogo.png'));

// ── icons ─────────────────────────────────────────────────────────────────────────────────────────
// browser tabs: the face nearly edge to edge on oat (dark ink must survive dark tab strips too)
await (await faceIcon(32, 0.94, OAT)).png({ compressionLevel: 9 }).toFile(out('favicon-32.png'));
await (await faceIcon(192, 0.84, OAT)).png({ compressionLevel: 9, palette: true, quality: 96 }).toFile(out('favicon-192.png'));
await (await faceIcon(512, 0.84, OAT)).png({ compressionLevel: 9, palette: true, quality: 96 }).toFile(out('favicon-512.png'));
// iOS home screen: opaque, iOS rounds the corners itself
await (await faceIcon(180, 0.8, OAT)).png({ compressionLevel: 9, palette: true, quality: 96 }).toFile(out('favicon-180.png'));
// Android adaptive icon: everything inside the 80% safe circle
await (await faceIcon(512, 0.62, OAT)).png({ compressionLevel: 9, palette: true, quality: 96 }).toFile(out('favicon-maskable-512.png'));
for (const f of ['favicon-32.png', 'favicon-180.png', 'favicon-192.png', 'favicon-512.png', 'favicon-maskable-512.png']) await say(out(f));

// the founder's own favicon at its native size (kept as the reference)
if (faviconSrc) {
  await sharp(faviconSrc).png({ compressionLevel: 9 }).toFile(out('snickerfavicon.png'));
  await say(out('snickerfavicon.png'));
}

// favicon.ico (16/32/48, PNG-in-ICO) — what old browsers and feed readers ask for at /favicon.ico
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map(async (s) => (await faceIcon(s, s === 16 ? 1 : 0.94, OAT)).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * icoPngs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoPngs.length, 4);
let offset = header.length;
icoPngs.forEach((png, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(icoSizes[i], e);
  header.writeUInt8(icoSizes[i], e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(png.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
writeFileSync(path.join(ROOT, 'src', 'app', 'favicon.ico'), Buffer.concat([header, ...icoPngs]));
console.log('src/app/favicon.ico  16/32/48');

// ── the badge: the lockup on a cream disc (site badge + the printed card's back mark) ─────────────
async function badge(size) {
  const disc = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 0.5}" fill="#FFFBF2"/></svg>`,
  );
  const mark = await sharp(lockup).resize({ width: Math.round(size * 0.78), kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: CLEAR } })
    .composite([{ input: disc }, { input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 });
}
await (await badge(282)).toFile(out('snickerdoodle-badge.png'));
await say(out('snickerdoodle-badge.png'));
// printed at 18% of a 1530px panel (≈275px) — 300px source keeps it crisp at 300dpi
const cardBadge = path.join(ROOT, 'src', 'server', 'print', 'assets', 'card-back-badge.png');
await (await badge(300)).toFile(cardBadge);
await say(cardBadge);

// ── share card (Open Graph) for pages without their own picture: the lockup on paper ─────────────
const ogMark = await sharp(lockup).resize({ width: 760, kernel: 'lanczos3' }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: PAPER } })
  .composite([{ input: ogMark, gravity: 'centre' }])
  .flatten({ background: PAPER })
  .png({ compressionLevel: 9, palette: true, quality: 95 })
  .toFile(out('og-default.png'));
await say(out('og-default.png'));

console.log(`lockup ${lm.width}×${lm.height} (ratio ${(lm.width / lm.height).toFixed(4)}), face ${fm.width}×${fm.height}`);
