// Builds every C14 leaflet from leaflet.html: a print PDF (trim + 3 mm bleed, no marks), a proof PDF (trim
// and safe-area lines drawn on) and on-screen previews (PNG, trimmed, front + back side by side).
// Run from the repo root:   node project-office/gtm/C14-leaflets/build.mjs
// Optional:                 node project-office/gtm/C14-leaflets/build.mjs --cmyk
//   also writes <name>-print-CMYK.pdf: each side as a 450 dpi CMYK image (via cmyk.py + Pillow and the
//   Windows "RSWOP" press profile). Only for a printer that refuses RGB; see README.
// Uses the repo's Playwright (falls back to installed Edge/Chrome), the self-hosted fonts in node_modules
// (@fontsource) and the Tabler icon set (@tabler/icons). No network.
// Needs Python with pypdf for the exact page boxes (pip install pypdf), and Pillow for --cmyk.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'print');
const prev = path.join(dir, 'preview');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(prev, { recursive: true });

// Every version: one print run each (each has its own code + QR, so each channel can be counted).
export const VERSIONS = [
  { name: 'A6-christmas-FAIR', size: 'a6', season: 'xmas', code: 'MAGICFAIR', qr: 'fair', use: 'fairs, markets, stalls, venue counters' },
  { name: 'A6-christmas-GATE', size: 'a6', season: 'xmas', code: 'MAGICGATE', qr: 'gate', use: 'school gates (public pavement), cafés, soft play, hand to hand' },
  { name: 'A5-christmas-DOOR', size: 'a5', season: 'xmas', code: 'MAGICDOOR', qr: 'door', use: 'door-to-door (yourself or a distributor), before 6 Dec' },
  { name: 'A5-christmas-BAGS', size: 'a5', season: 'xmas', code: 'MAGICBAGS', qr: 'bags', use: 'book bags, only where a head has said yes before Christmas' },
  { name: 'A5-spring-BAGS', size: 'a5', season: 'spring', code: 'MAGICBAGS', qr: 'bags', use: 'book bags / Primary Times, Jan-Feb 2027, for Mother’s Day' },
];
const SIZES = { a6: { w: 105, h: 148 }, a5: { w: 148, h: 210 } };
const BLEED = 3;

const font = (spec) => pathToFileURL(require.resolve(spec)).href;
// Bricolage as three STATIC weights (fonts/, made by fonts/make-static.py): Chrome embeds the variable
// font as Type 3, which some print shops' checks reject. Gaegu is already static.
const FONT_CSS = [400, 700, 800].map((w) => `@font-face { font-family: 'Bricolage'; font-weight: ${w}; font-style: normal;
  src: url('${pathToFileURL(path.join(dir, 'fonts', `BricolageGrotesque-${w}.ttf`)).href}') format('truetype'); }`).join('\n') + `
@font-face { font-family: 'Gaegu'; font-weight: 700; font-style: normal;
  src: url('${font('@fontsource/gaegu/files/gaegu-latin-700-normal.woff2')}') format('woff2'); }`;

// @tabler/icons' exports hide its files from require.resolve: find node_modules from a font we did resolve
const nodeModules = require.resolve('@fontsource/gaegu/files/gaegu-latin-700-normal.woff2').split(/[\\/]@fontsource[\\/]/)[0];
const tablerDir = path.join(nodeModules, '@tabler', 'icons', 'icons', 'outline');
const TABLER = Object.fromEntries(['camera', 'sparkles', 'gift', 'truck', 'heart', 'lock', 'home', 'trash', 'shield-check']
  .map((n) => [n, fs.readFileSync(path.join(tablerDir, `${n}.svg`), 'utf8').replace(/class="[^"]*"/, '').replace(/\s(width|height)="24"/g, '')]));
const QRS = Object.fromEntries(['fair', 'gate', 'bags', 'door'].map((n) => [n, fs.readFileSync(path.join(dir, 'qr', `${n}.svg`), 'utf8')]));

async function launch() {
  for (const opts of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try { return await chromium.launch(opts); } catch { /* try the next one */ }
  }
  throw new Error('No Chromium found: run `npx playwright install chromium`');
}

async function render(page, v, proof) {
  const qs = new URLSearchParams({ size: v.size, season: v.season, code: v.code, qr: v.qr });
  await page.goto(pathToFileURL(path.join(dir, 'leaflet.html')).href + '?' + qs + (proof ? '&proof' : ''), { waitUntil: 'load' });
  await page.addStyleTag({ content: FONT_CSS });
  await page.evaluate(({ TABLER, QRS }) => { window.TABLER = TABLER; window.QRS = QRS; window.__render(); }, { TABLER, QRS });
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load("800 20px 'Bricolage'"), document.fonts.load("700 20px 'Gaegu'")]);
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  const bad = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
  if (bad.length) throw new Error(`${v.name}: missing images ${bad.join(', ')}`);
}

// print copies of the site's images (public/) into img/: photos as high-quality JPEG (Chrome embeds a JPEG
// as it is; a WebP gets re-packed losslessly and the PDF balloons), textures as PNG (they're see-through)
const sharp = require('sharp');
const publicDir = path.join(dir, '..', '..', '..', 'public');
const html = fs.readFileSync(path.join(dir, 'leaflet.html'), 'utf8');
for (const src of new Set([...html.matchAll(/'((?:christmas|examples|textures)\/[\w-]+\.webp)'/g)].map((m) => m[1]))) {
  const isTexture = src.startsWith('textures/');
  const dest = path.join(dir, 'img', src.replace(/\.webp$/, isTexture ? '.png' : '.jpg'));
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const img = sharp(path.join(publicDir, src));
  await (isTexture ? img.png({ compressionLevel: 9 }) : img.flatten({ background: '#ffffff' }).jpeg({ quality: 90, chromaSubsampling: '4:4:4' })).toFile(dest);
}

const cmyk = process.argv.includes('--cmyk');
const browser = await launch();
const report = [];
for (const v of VERSIONS) {
  const { w, h } = SIZES[v.size];
  const W = w + 2 * BLEED, H = h + 2 * BLEED;
  const pxPerMm = 96 / 25.4;
  const page = await browser.newPage({ viewport: { width: Math.ceil(W * pxPerMm), height: Math.ceil(H * pxPerMm) }, deviceScaleFactor: 3 });

  for (const proof of [false, true]) {
    await render(page, v, proof);
    const file = path.join(out, `${v.name}-${proof ? 'proof' : 'print'}.pdf`);
    await page.pdf({ path: file, width: `${W}mm`, height: `${H}mm`, printBackground: true, pageRanges: '1-2' });
    // Chrome rounds the page a fraction of a mm too big: set the exact page (= bleed box) and the trim box
    execFileSync('python', [path.join(dir, 'boxes.py'), file, String(W), String(H), String(BLEED)], { stdio: 'inherit' });
  }

  // on-screen previews: the trimmed sides (no bleed), side by side, from the print render
  await render(page, v, false);
  const sides = await page.$$('.side');
  const shots = [];
  for (const [i, s] of sides.entries()) {
    const b = await s.boundingBox();
    const m = BLEED * pxPerMm;
    const file = path.join(prev, `${v.name}-${i ? 'back' : 'front'}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 88, fullPage: true, clip: { x: b.x + m, y: b.y + m, width: b.width - 2 * m, height: b.height - 2 * m } });
    shots.push(file);
  }
  // front + back side by side on a grey board, for a quick look on a phone
  {
    const [f, bk] = await Promise.all(shots.map((s) => sharp(s).resize({ height: 1100 }).toBuffer({ resolveWithObject: true })));
    await sharp({ create: { width: f.info.width + bk.info.width + 60, height: 1160, channels: 3, background: '#9a9a9a' } })
      .composite([{ input: f.data, left: 20, top: 30 }, { input: bk.data, left: f.info.width + 40, top: 30 }])
      .jpeg({ quality: 85 }).toFile(path.join(prev, `${v.name}-spread.jpg`));
  }

  if (cmyk) {
    const hi = await browser.newPage({ viewport: { width: Math.ceil(W * pxPerMm), height: Math.ceil(H * pxPerMm) }, deviceScaleFactor: 450 / 96 });
    await render(hi, v, false);
    const full = [];
    for (const [i, s] of (await hi.$$('.side')).entries()) {
      const f = path.join(out, `.tmp-${v.name}-${i}.png`);
      await s.screenshot({ path: f });
      full.push(f);
    }
    execFileSync('python', [path.join(dir, 'cmyk.py'), path.join(out, `${v.name}-print-CMYK.pdf`), String(W), String(H), ...full], { stdio: 'inherit' });
    full.forEach((f) => fs.rmSync(f));
    await hi.close();
  }
  await page.close();
  report.push(`${v.name}: ${w}x${h} mm + ${BLEED} mm bleed = ${W}x${H} mm · code ${v.code} · QR ?from=${v.qr} · ${v.use}`);
}
await browser.close();
console.log(report.join('\n'));
