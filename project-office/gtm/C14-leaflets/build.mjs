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
  // words and buttons must sit inside the safe area (trim minus 5 mm); pictures may run into it
  const px = 96 / 25.4, safe = (BLEED + 5) * px, slack = 0.4 * px;
  const out = await page.evaluate(({ safe, slack, px }) => [...document.querySelectorAll('.side')].flatMap((side, i) => {
    const s = side.getBoundingClientRect();
    return [...side.querySelectorAll('h1,h2,h3,p,.pill,.card,.tag,.coupon,.logo-tag')].filter((el) => !el.closest('.card,.tag,.coupon,.box') || el.matches('.card,.tag,.coupon'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.left - s.left < safe - slack || r.top - s.top < safe - slack || s.right - r.right < safe - slack || s.bottom - r.bottom < safe - slack)
      .map(({ el, r }) => `${i ? 'back' : 'front'}: "${(el.textContent || el.className).trim().slice(0, 40)}" ${((Math.min(r.left - s.left, r.top - s.top, s.right - r.right, s.bottom - r.bottom)) / px - 3).toFixed(1)} mm from the trim`);
  }), { safe, slack, px });
  if (out.length) console.warn(`! ${v.name}: inside the 5 mm safe margin:\n  ${out.join('\n  ')}`);
}

// Print copies of every picture the leaflets use, into img/ (committed, so a rebuild needs no sources).
// Sources: the site's own public/ and mockups/, and the founder's brand-assets folder (not in git; set
// BRAND_ASSETS if it isn't at ..\brand-assets next to the repo). Photos become high-quality JPEG (Chrome embeds a
// JPEG as it is; a WebP or PNG photo gets re-packed losslessly and the PDF balloons); cut-outs stay PNG.
const sharp = require('sharp');
const repo = path.join(dir, '..', '..', '..');
const brandAssets = [process.env.BRAND_ASSETS, path.join(repo, '..', 'brand-assets'), path.join(repo, '..', '..', '..', '..', 'brand-assets')]
  .find((p) => p && fs.existsSync(p));
const B = (p) => (brandAssets ? path.join(brandAssets, p) : null);
const R = (p) => path.join(repo, p);
// name in img/ : [source, longest edge in px, how]   how: 'jpg' | 'png' (keep transparency) | 'square' (centre crop, jpg)
const IMAGES = {
  'logo-christmas.png': [R('public/brand/snickerlogo-christmas.png'), 1200, 'png'],
  'logo.png': [R('public/brand/snickerlogo.png'), 1200, 'png'],
  'paper-kraft-christmas.jpg': [B('backgrounds/christmas/wrap-kraft-christmas-tile-2400.png'), 1400, 'jpg'],
  'paper-oat-christmas.jpg': [B('backgrounds/christmas/wrap-oat-christmas-tile-2400.png'), 1400, 'jpg'],
  'paper-kraft.jpg': [B('backgrounds/everyday/wrap-kraft-tile-2400.png'), 1400, 'jpg'],
  'paper-oat.jpg': [B('backgrounds/everyday/wrap-oat-tile-2400.png'), 1400, 'jpg'],
  'sketch-robin.jpg': [B('website/christmas/child-sketches/sketch-robin.png'), 1600, 'jpg'],
  'robin-ornament.jpg': [B('website/christmas/robin-bauble-1x1.png'), 1800, 'jpg'],
  'mug-tree.jpg': [B('website/christmas/christmas-tree-mug-1x1.png'), 900, 'square'],
  'cards-hanging.jpg': [R('public/christmas/hero-cardshanging.webp'), 900, 'square'],
  'wrapping-paper.jpg': [R('mockups/christmas/img/wrapped-presents.jpg'), 900, 'square'],
  'calendar.jpg': [R('mockups/christmas/img/calendar-hands.jpg'), 900, 'square'],
  'range-drawing.jpg': [R('public/examples/range/drawing.webp'), 900, 'jpg'],
  'range-framed.png': [R('public/examples/range/framed-print.webp'), 900, 'png'],
  'range-card.png': [R('public/examples/range/card.webp'), 900, 'png'],
  'range-cushion.png': [R('public/examples/range/heart-cushion.webp'), 900, 'png'],
  'card-castle.jpg': [R('public/examples/cardcastle.webp'), 900, 'square'],
  'mug-truck.jpg': [R('public/examples/mugtruck.webp'), 900, 'square'],
  'cushion-flower.jpg': [R('public/examples/cushionheartflower.webp'), 900, 'square'],
  'jigsaw-digger.jpg': [R('public/examples/puzzledigger.webp'), 900, 'square'],
  'range-mug.jpg': [R('public/examples/family-mug.webp'), 617, 'square'],
};
for (const [name, [src, edge, how]] of Object.entries(IMAGES)) {
  const dest = path.join(dir, 'img', name);
  if (fs.existsSync(dest)) continue;
  if (!src || !fs.existsSync(src)) throw new Error(`img/${name} is missing and its source isn't here (${src ?? 'brand-assets not found: set BRAND_ASSETS'})`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let im = sharp(src);
  if (how === 'square') {
    const m = await im.metadata();
    const side = Math.min(m.width, m.height);
    im = im.extract({ left: Math.floor((m.width - side) / 2), top: Math.floor((m.height - side) / 2), width: side, height: side }).flatten({ background: '#ffffff' });
  }
  im = im.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });
  await (how === 'png' ? im.png({ compressionLevel: 9 }) : im.flatten({ background: '#ffffff' }).jpeg({ quality: 90, chromaSubsampling: '4:4:4' })).toFile(dest);
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
