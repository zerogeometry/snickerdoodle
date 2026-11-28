// PRINT AUDIT (28 Nov 2026): for each product on sale, lay a MEASURING GRID (grid.ts) the exact shape of
// its print file through the shop's OWN preview code, and put it side by side with the print file as sent
// and Prodigi's downloadable template. Read-only: no database, no storage, no child's image, no Prodigi call.
//
//   npx tsx --conditions=react-server scripts/print-audit/render.ts <out-dir> [templates-dir] [--only name,name]
//
// templates-dir holds PNGs of Prodigi's templates (their PSD/PDF templates converted to PNG); the
// .prodigi-assets/templates folder is searched too. Run where .prodigi-assets is staged (the founder's machine).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { definedPriceList, definedPrintSpecs } from '@/server/catalogue';
import { renderMockupLayers, renderPrintedFace, renderTemplatePreview } from '@/server/print/compositor';
import { canvasSizePx, type Transform } from '@/server/print/geometry';
import { printFileSize } from '@/server/print/printFile';
import { authorCtx, authorTemplate, BUNDLE_BACKDROP, TILE_LAYERS } from '@/server/print/seedMockups';
import { buildLayout, decodeBundleLayout, decodeDrawing, encodeBundle, renderBundleLayers } from '@/server/print/bundleMockup';
import { buildFrameLayout, frameLayoutDir } from '@/server/print/frameLayout';
import { frameGridOf } from '@/lib/multi-photo-frame';
import { measuringGrid } from './grid';

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? args.splice(oi, 2)[1]!.split(',') : null;
const [outDir, tplDir = path.join('.prodigi-assets', 'templates')] = args;
if (!outDir) throw new Error('usage: render.ts <out-dir> [templates-dir]');
mkdirSync(outDir, { recursive: true });
const T = (f: string) => [path.join(tplDir, f), path.join('.prodigi-assets', 'templates', f)].find(existsSync) ?? null;

type Face = 'pattern' | 'heightChart' | 'gallery' | 'strap' | 'frameGrid';
type Case = { name: string; key: string; match?: (a: Record<string, string>) => boolean; templates?: string[]; face?: Face; mug?: boolean; layout?: 'tile' | 'frame' };
const is = (o: Record<string, string>) => (a: Record<string, string>) => Object.entries(o).every(([k, v]) => a[k] === v);
const CASES: Case[] = [
  { name: 'mug-twotone-blue', key: 'mug', match: is({ colour: 'blue' }), mug: true, templates: ['prodigi-photo-mugs-templates/prodigi-11oz-mug.png', 'prodigi-coloured-photo-mugs-templates/prodigi-11oz-coloured-photo-mug-template.png'] },
  { name: 'frame-11x14-gold-portrait', key: 'framedPrint', match: is({ size: '11×14″', colour: 'gold', orientation: 'portrait' }) },
  { name: 'frame-24x32-black-landscape', key: 'framedPrint', match: is({ size: '24×32″', colour: 'black', orientation: 'landscape' }) },
  { name: 'cushion-heart', key: 'cushion', match: is({ size: '11″ heart' }), templates: ['prodigi-heart-shaped-cushion-11.png'] },
  { name: 'cushion-round', key: 'cushion', match: is({ size: '18″ round' }), templates: ['prodigi-round-cushion-18.png'] },
  { name: 'cushion-12-square', key: 'cushion', match: is({ size: '12″ square', sides: 'single' }), templates: ['prodigi-square-cushion-single-sided-12x12.png'] },
  { name: 'cushion-22-square-double', key: 'cushion', match: is({ size: '22″ square', sides: 'double' }), templates: ['prodigi-square-cushion-double-sided-22x22.png'] },
  { name: 'kids-tee', key: 'kidsTee', match: (a) => a.colour === 'white' && /3/.test(a.size ?? '') },
  { name: 'adult-tee', key: 'adultTee', match: is({ size: 'M', colour: 'white' }) },
  { name: 'jigsaw-30-landscape', key: 'jigsaw', match: is({ size: '30 pieces', orientation: 'landscape' }) },
  { name: 'jigsaw-252-portrait', key: 'jigsaw', match: is({ size: '252 pieces', orientation: 'portrait' }) },
  { name: 'blanket-medium-portrait', key: 'blanket', match: is({ size: 'medium', orientation: 'portrait' }), templates: ['prodigi-medium-blanket.png'] },
  { name: 'blanket-large-landscape', key: 'blanket', match: is({ size: 'large', orientation: 'landscape' }), templates: ['prodigi-large-blanket.png'] },
  { name: 'card', key: 'card', templates: ['prodigi-classic-greetings-cards-templates/prodigi-classic-greetings-card-7x5.png'] },
  { name: 'calendar-a4', key: 'calendar', match: is({ size: 'A4' }), face: 'gallery', templates: ['prodigi-dated-calendar-a4-single-page-template.png'] },
  { name: 'ceramic-ornament', key: 'ceramicOrnament', templates: ['prodigi-ceramic-christmas-tree-ornaments-templates/prodigi-ceramic-christmas-tree-ornament.png'] },
  { name: 'plastic-bauble', key: 'christmasBauble', templates: ['prodigi-christmas-baubles-templates/prodigi-christmas-bauble.png'] },
  { name: 'placemat', key: 'placemat', layout: 'tile' },
  { name: 'coaster', key: 'coaster', layout: 'tile' },
  { name: 'multi-frame-3x3', key: 'multiPhotoFrame', match: (a) => a.size === '12×12″' && a.colour === 'black', layout: 'frame' },
  { name: 'phone-iphone17-snap', key: 'phoneCase', match: is({ size: 'iPhone 17', grade: 'snap', finish: 'gloss' }), templates: ['phone-cases/prodigi-iphone-17-snap-phone-case.png'] },
  { name: 'phone-iphone17-tough', key: 'phoneCase', match: is({ size: 'iPhone 17', grade: 'tough', finish: 'gloss' }), templates: ['phone-cases/prodigi-iphone-17-tough-phone-case.png'] },
  { name: 'phone-galaxy-s25-tough', key: 'phoneCase', match: (a) => /S25$/.test(a.size ?? '') && a.grade === 'tough' && a.finish === 'gloss', templates: ['phone-cases/prodigi-samsung-galaxy-s25-tough-phone-case.png'] },
  { name: 'watch-strap-large', key: 'watchStrap', match: (a) => a.size === 'large', face: 'strap' },
  { name: 'socks-ankle', key: 'socks', match: is({ size: 'ankle' }), face: 'pattern', templates: ['prodigi-ankle-socks-templates/prodigi-socks-ankle.png'] },
  { name: 'socks-tube', key: 'socks', match: is({ size: 'tube' }), face: 'pattern', templates: ['prodigi-tube-socks-templates/prodigi-socks-tube.png'] },
  { name: 'height-chart-30x150', key: 'heightChart', match: (a) => /30 × 150/.test(a.size ?? '') && a.colour === 'natural', face: 'heightChart' },
  { name: 'wrapping-paper-3m', key: 'wrappingPaper', match: (a) => /3 m/.test(a.size ?? '') && !/kraft/i.test(a.colour ?? ''), face: 'pattern' },
  { name: 'wrapping-paper-kraft-2m', key: 'wrappingPaper', match: (a) => /2 m/.test(a.size ?? '') && a.colour === 'kraft', face: 'pattern' },
  { name: 'tea-towel', key: 'teaTowel', face: 'pattern', templates: ['prodigi-tea-towels-templates/prodigi-cotton-tea-towel-uk-465x695cm.png'] },
  { name: 'playing-cards', key: 'playingCards' },
];

const FILL: Transform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
const PANEL_H = 900;
async function panel(img: Buffer, label: string, h = PANEL_H): Promise<Buffer> {
  const r = await sharp(img).flatten({ background: '#ffffff' }).resize({ height: h, width: Math.round(h * 1.6), fit: 'inside' }).png().toBuffer();
  const m = await sharp(r).metadata();
  const w = Math.max(m.width!, 380);
  const lines = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').split('\n');
  const capH = 40 + 26 * (lines.length - 1);
  const cap = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${capH}"><rect width="100%" height="100%" fill="#2b2118"/>${lines.map((l, i) => `<text x="12" y="${27 + 26 * i}" font-family="Arial" font-size="21" fill="#fff">${l}</text>`).join('')}</svg>`);
  return sharp({ create: { width: w, height: h + capH, channels: 3, background: '#f8f5e9' } })
    .composite([{ input: cap, top: 0, left: 0 }, { input: r, top: capH, left: Math.round((w - m.width!) / 2) }]).jpeg({ quality: 82 }).toBuffer();
}
async function sideBySide(panels: Buffer[]): Promise<Buffer> {
  const metas = await Promise.all(panels.map((p) => sharp(p).metadata()));
  const W = metas.reduce((s, m) => s + m.width! + 16, 16), H = Math.max(...metas.map((m) => m.height!)) + 32;
  let x = 16;
  const comps = panels.map((p, i) => { const c = { input: p, left: x, top: 16 }; x += metas[i]!.width! + 16; return c; });
  return sharp({ create: { width: W, height: H, channels: 3, background: '#d9c7a9' } }).composite(comps).jpeg({ quality: 78 }).toBuffer();
}
const rawToPng = (r: { data: Buffer | Uint8Array; width: number; height: number; channels: number }) =>
  sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: r.channels as 1 | 2 | 3 | 4 } }).png().toBuffer();

const prices = definedPriceList();
const specs = definedPrintSpecs();
const ctx = authorCtx();
const summary: string[] = [];
for (const c of CASES) {
  if (only && !only.includes(c.name)) continue;
  const v = prices.find((x) => x.productKey === c.key && (!c.match || c.match(x.attributes)));
  const s = v && specs.find((x) => x.sku === v.sku);
  if (!v || !s || !v.px) { summary.push(`${c.name}: no variant`); continue; }
  const canvas = canvasSizePx(s.template);
  const file = printFileSize(c.key, v.attributes, s.template);
  const mmPerPx = 25.4 / v.dpi;
  const gridCanvas = await measuringGrid(canvas.width * mmPerPx, canvas.height * mmPerPx);
  const print = { widthPx: v.px.w, heightPx: v.px.h, bleedMm: v.bleedMm, requiredDpi: v.dpi };
  const panels: Buffer[] = [];
  for (const t of c.templates ?? []) { const f = T(t); if (f) panels.push(await panel(await sharp(f).png().toBuffer(), `Prodigi template\n${path.basename(f)}`)); }
  // the PRINT FILE as sent: the grid on the design canvas (or the product's printed face of it), turned to Prodigi's way up
  let face = gridCanvas;
  if (c.face === 'heightChart' || c.face === 'gallery' || c.face === 'strap') face = await rawToPng(await renderPrintedFace(gridCanvas, c.face, print, FILL));
  const fm = await sharp(face).metadata();
  const double = v.attributes.sides === 'double';
  const turned = file.w !== canvas.width * (double ? 2 : 1);
  let fileImg = turned ? await sharp(face).rotate(90).png().toBuffer() : face;
  if (double) fileImg = await sharp({ create: { width: 2 * fm.width!, height: fm.height!, channels: 3, background: '#fff' } }).composite([{ input: face, left: 0, top: 0 }, { input: face, left: fm.width!, top: 0 }]).png().toBuffer();
  panels.push(await panel(fileImg, `our print file ${file.w}×${file.h}px\n${(file.w * mmPerPx).toFixed(1)}×${(file.h * mmPerPx).toFixed(1)} mm${turned ? ', turned to Prodigi’s way up' : ''}`));
  try {
    if (c.layout) {
      const drawing = await decodeDrawing(gridCanvas);
      let webp: Buffer;
      if (c.layout === 'frame') {
        const grid = frameGridOf(v.attributes.size, v.attributes.orientation);
        const dir = grid ? frameLayoutDir(grid) : null;
        if (!dir) throw new Error('frame layers not staged');
        const built = await buildFrameLayout(dir, v.attributes.colour!, BUNDLE_BACKDROP);
        webp = (await encodeBundle(await renderBundleLayers(await decodeBundleLayout(built.base, built.regions, 2048), () => drawing))).buffer;
      } else {
        const layers = TILE_LAYERS[c.key as 'placemat' | 'coaster'];
        const m = await sharp(layers[0]!.file).metadata();
        const built = await buildLayout(layers, [m.width!, m.height!], BUNDLE_BACKDROP);
        webp = (await encodeBundle(await renderBundleLayers(await decodeBundleLayout(built.base, built.regions, 2048), () => drawing, FILL))).buffer;
      }
      panels.push(await panel(webp, 'our preview (the grid, filled)'));
      summary.push(`${c.name}: ${v.sku} → ${s.prodigiSku} file ${file.w}×${file.h} (layout)`);
    } else {
      const a = await authorTemplate({ sku: v.sku, key: c.key, attrs: v.attributes, printWmm: v.mm.w, printHmm: v.mm.h, printWpx: v.px.w, printHpx: v.px.h }, ctx);
      if ('skip' in a) throw new Error(`template skipped: ${a.skip}`);
      const t = a.template;
      const meta = await sharp(t.blank).metadata();
      const workEdge = Math.max(meta.width!, meta.height!);
      if (c.mug) {
        for (const mode of ['front', 'back'] as const) {
          const out = await renderMockupLayers({ blank: t.blank, mask: t.mask, overlay: t.overlay, design: gridCanvas, quad: t.printQuad, transform: FILL, workEdge, outputEdge: 1400, print, materialClass: t.materialClass, mugMode: mode });
          panels.push(await panel(out.buffer, `our preview: ${mode}`));
        }
        if (a.centre) {
          const cm = await sharp(a.centre.blank).metadata();
          const out = await renderMockupLayers({ blank: a.centre.blank, mask: a.centre.mask, design: gridCanvas, quad: a.centre.printQuad, transform: FILL, workEdge: Math.max(cm.width!, cm.height!), outputEdge: 1400, print, materialClass: a.centre.materialClass, mugMode: 'centre' });
          panels.push(await panel(out.buffer, 'our preview: centre view'));
        }
      } else if (c.face === 'pattern' || c.face === 'heightChart' || c.face === 'gallery') {
        // the printed face IS the file: lay the file's grid straight on, to show how much of the FILE the photo shows
        const out = await renderMockupLayers({ blank: t.blank, mask: t.mask, overlay: t.overlay, design: face, quad: t.printQuad, extraQuads: t.extraQuads, transform: FILL, workEdge, outputEdge: 1400, print: { ...print, bleedMm: 0 }, materialClass: t.materialClass });
        panels.push(await panel(out.buffer, 'our preview, the FILE laid on\n(how much of the file the photo shows)'));
      } else {
        const out = await renderTemplatePreview({ blank: t.blank, mask: t.mask, overlay: t.overlay, quad: t.printQuad, extraQuads: t.extraQuads, materialClass: t.materialClass, design: gridCanvas, productKey: c.key, transform: FILL, size: 'zoom', print });
        panels.push(await panel(out, `our preview (the grid, filled)\n${a.registration.mode}`));
      }
      summary.push(`${c.name}: ${v.sku} → ${s.prodigiSku} file ${file.w}×${file.h} canvas ${canvas.width}×${canvas.height} bleed ${v.bleedMm}mm · ${a.registration.mode} drift ${a.registration.driftPct ?? '-'}%`);
    }
  } catch (e) {
    summary.push(`${c.name}: preview FAILED — ${(e as Error).message}`);
  }
  writeFileSync(path.join(outDir, `${c.name}.jpg`), await sideBySide(panels));
  console.log(`${c.name}.jpg`);
}
console.log(summary.join('\n'));
