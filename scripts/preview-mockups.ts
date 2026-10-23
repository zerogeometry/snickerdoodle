// Preview the founder-photographed product sets on THIS machine, before seeding: renders a test
// drawing onto each layered set with the shop's own compositor and writes WebP files to look at.
// No database, no storage, no child's image — pass brand-safe test art only (sample-art/).
//
//   npx tsx --conditions=react-server scripts/preview-mockups.ts <drawing.png> [out-dir] [--ground navy]
//   (--ground: a repeat-pattern base colour token from src/lib/patterns.ts; use a see-through drawing)
//
// Re-run scripts/compose-founder-layers.mjs first if a photo changed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { definedPriceList } from '@/server/catalogue';
import { renderTemplatePreview } from '@/server/print/compositor';
import { layeredFlatPath, layeredFlatTemplate } from '@/server/print/seedMockups';
import { assertQuadFitsBlank } from '@/server/print/templates';

const args = process.argv.slice(2);
const gi = args.indexOf('--ground');
const ground = gi >= 0 ? args.splice(gi, 2)[1] : undefined;
const [drawing, outDir = path.join('.prodigi-assets', 'previews')] = args;
if (!drawing) throw new Error('usage: preview-mockups.ts <test-drawing.png> [out-dir]');
const design = readFileSync(drawing);
mkdirSync(outDir, { recursive: true });

// One variant per photo set (the sets are shared across a product's sizes).
// dpi = the variant's print dpi in src/server/catalogue.ts (it sets a pattern's motif size).
const SETS: { key: string; set: string; sku?: string; material: string; dpi: number; tilted?: boolean; window?: boolean; pieces?: boolean }[] = [
  { key: 'socks', set: 'socks/ankle', sku: 'GLOBAL-ANKLE-SOCKS', material: 'LIGHT_FABRIC', dpi: 300, tilted: true, pieces: true },
  { key: 'socks', set: 'socks/tube', sku: 'GLOBAL-TUBE-SOCKS', material: 'LIGHT_FABRIC', dpi: 300, pieces: true },
  { key: 'teaTowel', set: 'teaTowel', material: 'LIGHT_FABRIC', dpi: 300 },
  { key: 'wrappingPaper', set: 'wrappingPaper', sku: 'WRAP-ROL-70X300', material: 'PAPER', dpi: 150, window: true },
  { key: 'wrappingPaper', set: 'wrappingPaper', sku: 'WRAP-ROL-70X500', material: 'PAPER', dpi: 150, window: true },
  { key: 'playingCards', set: 'playingCards', material: 'PAPER', dpi: 300, tilted: true },
];

const variants = definedPriceList();
for (const s of SETS) {
  const v = variants.find((x) => x.productKey === s.key && (!s.sku || x.prodigiSku === s.sku));
  const dir = layeredFlatPath(s.set);
  if (!v?.px || !dir) { console.log(`${s.set}: skipped (${!dir ? 'set not staged' : 'no variant'})`); continue; }
  const t = await layeredFlatTemplate(dir, v.px.w / v.px.h, !!s.tilted, !!s.window, !!s.pieces);
  if (!t) { console.log(`${s.set}: no print area`); continue; }
  // the seeder's own check — a preview that couldn't be seeded fails here too
  for (const q of [t.quad, ...(t.extraQuads ?? [])]) assertQuadFitsBlank(q, { warped: !!t.extraQuads?.length });
  const webp = await renderTemplatePreview({
    blank: t.blank, mask: t.mask, overlay: t.overlay, quad: t.quad, extraQuads: t.extraQuads, materialClass: s.material, design, productKey: s.key, ground,
    print: { widthPx: v.px.w, heightPx: v.px.h, bleedMm: 0, requiredDpi: s.dpi },
  });
  const file = path.join(outDir, `${s.set.replace('/', '-')}${s.sku ? '-' + s.sku : ''}${ground ? '-' + ground : ''}.webp`);
  writeFileSync(file, webp);
  console.log(`${file}`);
}
