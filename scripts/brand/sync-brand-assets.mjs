/**
 * Copies the brand into the site from the shared brand-assets folder (the one source for Snickerdoodle
 * AND Snickerdoodle Draw — logo/, icons/<season>/snickerdoodle/web/, backgrounds/):
 *   node scripts/brand/sync-brand-assets.mjs [path/to/brand-assets]   (default: ../brand-assets)
 *
 * Snickerdoodle Draw's lockup, app icon and share card come too (draw-*.webp/png, for /draw and the "get the
 * app" bubble), plus its store screenshots from the Draw repo (public/draw/screens) and the film poster.
 *
 * Every file comes in twice — everyday and christmas (Santa hat). The everyday files keep their old names,
 * so nothing that links them changes; the christmas ones end in -christmas. src/lib/brand.ts picks between
 * them by season. Re-run whenever brand-assets changes. (The doodle textures and floating doodles come from
 * backgrounds/<season>/doodle-sheet*-reference.png via scripts/textures/build.py.)
 *
 * Supersedes build-brand-assets.mjs for the logo, icons and share card; that script still builds the
 * printed card-back badge, which stays the everyday mark (prints outlive the season).
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.resolve(process.argv[2] ?? path.join(ROOT, '..', 'brand-assets'));
if (!existsSync(path.join(SRC, 'logo'))) throw new Error(`no brand-assets folder at ${SRC}`);
const BRAND = path.join(ROOT, 'public', 'brand');

/** PNG-in-ICO from [[size, pngBuffer], ...]. */
function toIco(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(([size, png], i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size, e);
    header.writeUInt8(size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map(([, png]) => png)]);
}

const say = async (file) => {
  const m = await sharp(file).metadata();
  console.log(`${path.relative(ROOT, file)}  ${m.width}×${m.height}`);
};

for (const season of ['everyday', 'christmas']) {
  const sfx = season === 'christmas' ? '-christmas' : '';
  const out = (name) => path.join(BRAND, name.replace(/(\.\w+)$/, `${sfx}$1`));
  const icons = path.join(SRC, 'icons', season, 'snickerdoodle', 'web');
  const logo = path.join(SRC, 'logo', season, `snickerdoodle-logo${sfx}.png`);

  // header lockup: trimmed to its ink, one webp sized for the tallest header (56px) at 3×
  const lockup = await sharp(logo).trim({ threshold: 1 }).png().toBuffer();
  const lm = await sharp(lockup).metadata();
  await sharp(lockup).resize({ height: 168, kernel: 'lanczos3' }).webp({ quality: 86, alphaQuality: 88, effort: 6, smartSubsample: true }).toFile(out('snickerdoodle-logo.webp'));
  await say(out('snickerdoodle-logo.webp'));
  console.log(`  lockup ratio ${(lm.width / lm.height).toFixed(4)}  (src/lib/brand.ts LOGO_RATIO)`);
  // a PNG of the lockup (structured data, emails — anywhere webp isn't welcome)
  await sharp(lockup).resize({ width: 1200, kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 95 }).toFile(out('snickerlogo.png'));
  await say(out('snickerlogo.png'));

  // icons: brand-assets already makes them at the right sizes — copy as they are
  const ICONS = {
    'favicon-32.png': 'favicon-32.png',
    'icon-192.png': 'favicon-192.png',
    'icon-512.png': 'favicon-512.png',
    'apple-touch-icon.png': 'favicon-180.png',
    'icon-512-maskable.png': 'favicon-maskable-512.png',
  };
  for (const [from, to] of Object.entries(ICONS)) {
    copyFileSync(path.join(icons, from), out(to));
    await say(out(to));
  }
  // /favicon.ico (16/32/48): the everyday one is public/favicon.ico (old browsers ask for it by name); christmas sits beside
  // the PNGs. Rebuilt from the brand-assets PNGs as RGBA PNG-in-ICO — Next.js can't decode the folder's own .ico.
  const ico = season === 'christmas' ? path.join(BRAND, 'favicon-christmas.ico') : path.join(ROOT, 'public', 'favicon.ico');
  const icoPngs = [
    [16, await sharp(path.join(icons, 'favicon-16.png')).ensureAlpha().png().toBuffer()],
    [32, await sharp(path.join(icons, 'favicon-32.png')).ensureAlpha().png().toBuffer()],
    [48, await sharp(path.join(icons, 'apple-touch-icon.png')).resize(48, 48, { kernel: 'lanczos3' }).ensureAlpha().png().toBuffer()],
  ];
  writeFileSync(ico, toIco(icoPngs));
  console.log(path.relative(ROOT, ico));

  // share card for pages without their own picture
  const og = path.join(SRC, 'logo', season, `og-share-image-1200x630${sfx}.png`);
  await sharp(og).png({ compressionLevel: 9, palette: true, quality: 95 }).toFile(out('og-default.png'));
  await say(out('og-default.png'));

  // ── Snickerdoodle Draw (the /draw page and the "get the app" bubble) ──
  // its lockup, trimmed to its ink: the page hero shows it up to ~440px wide, so 960 covers 2×
  const drawLogo = await sharp(path.join(SRC, 'logo', season, `snickerdoodle-draw-logo${sfx}.png`)).trim({ threshold: 1 }).png().toBuffer();
  const dm = await sharp(drawLogo).metadata();
  await sharp(drawLogo).resize({ width: 960, kernel: 'lanczos3' }).webp({ quality: 86, alphaQuality: 88, effort: 6, smartSubsample: true }).toFile(out('draw-logo.webp'));
  await say(out('draw-logo.webp'));
  console.log(`  draw lockup ratio ${(dm.width / dm.height).toFixed(4)}  (src/lib/brand.ts DRAW_LOGO_RATIO)`);
  // its app icon (sunshine), shown at up to 96px: 256 covers the bubble and the page at 2–3×
  await sharp(path.join(SRC, 'icons', season, 'draw', 'web', 'icon-512.png')).resize(256, 256, { kernel: 'lanczos3' }).webp({ quality: 88, effort: 6 }).toFile(out('draw-icon.webp'));
  await say(out('draw-icon.webp'));
  // the share card for /draw
  await sharp(path.join(SRC, 'logo', season, `draw-og-share-image-1200x630${sfx}.png`)).png({ compressionLevel: 9, palette: true, quality: 95 }).toFile(out('draw-og.png'));
  await say(out('draw-og.png'));
}

// The /draw page's film placeholder poster (16:9): the everyday Draw lockup on paper. Swapped for a frame of
// the real film when it arrives (src/lib/drawApp.ts DRAW_VIDEO).
{
  const DRAW = path.join(ROOT, 'public', 'draw');
  mkdirSync(path.join(DRAW, 'screens'), { recursive: true });
  // the lockup sits in the top half, leaving the bottom clear for the placeholder's play sticker (DrawFilm)
  const lockup = await sharp(path.join(SRC, 'logo', 'everyday', 'snickerdoodle-draw-logo.png')).trim({ threshold: 1 }).resize({ width: 470, kernel: 'lanczos3' }).png().toBuffer();
  const lm = await sharp(lockup).metadata();
  const poster = path.join(DRAW, 'video-poster.webp');
  await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#FFFBF2' } }) // paper
    .composite([{ input: lockup, left: Math.round((1280 - lm.width) / 2), top: 84 }])
    .webp({ quality: 84, effort: 6 })
    .toFile(poster);
  await say(poster);

  // App screenshots: the Play Store phone set (1080×1920, a sample child "Ellie", no real child's data), from the
  // Draw repo beside brand-assets (or DRAW_REPO=…). Halved and webp'd: the gallery shows them ≤ 260px wide.
  const repo = path.resolve(process.env.DRAW_REPO ?? path.join(SRC, '..', 'snickerdoodle-draw'));
  const shots = path.join(repo, 'docs', 'store', 'screenshots');
  if (!existsSync(shots)) {
    console.warn(`(no Draw screenshots at ${shots}: kept the ones in public/draw/screens)`);
  } else {
    for (const name of ['01-today', '02-lesson', '03-reveal', '04-learn', '05-rewards']) {
      const to = path.join(DRAW, 'screens', `${name}.webp`);
      await sharp(path.join(shots, `${name}.png`)).resize({ width: 540, kernel: 'lanczos3' }).webp({ quality: 84, effort: 6 }).toFile(to);
      await say(to);
    }
  }
}
