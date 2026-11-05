// The PUBLIC product pages' photos (/products/<slug>): ONE shared, brand-safe demo drawing, rendered
// through each product's OWN mockup template — the founder's layered photos where they're staged, the
// drawn / derived stand-in where they aren't — exactly as the seeder authors it (authorTemplate in
// src/server/print/seedMockups.ts) and the shop renders it (renderTemplatePreview / the layout tiles).
// No database, no storage, no viewer: the drawing is synthetic sample art, NEVER a family's upload.
//
//   npx tsx --conditions=react-server scripts/render-product-photos.ts [--all] [--only key,key] [--drawing file]
//
// Writes public/products/<slug>.webp (1200 px on its longest edge) and src/lib/product-photos.json (the
// sizes SHOP_PRODUCTS reads). By default only the products with no hand-made example photo; --all renders
// every product on show (to compare). Run it on the machine where .prodigi-assets lives, then commit both.
// A product whose photos aren't staged here keeps its last committed photo (or none) and is listed.
// A NEW file must also join PUBLIC_FILES in src/lib/siteMode.ts (the site password gate's list) — breakInGate.test.ts says which.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { defaultPlacementFor } from '@/lib/catalogue-view';
import { BUNDLE_KEY, BUNDLE_ONLY_SKUS } from '@/lib/christmas-bundle';
import { SHOP_PRODUCTS } from '@/lib/shop-products';
import { DEMO_DRAWING, PRODUCT_PHOTO_DIR, type ProductPhoto } from '@/lib/product-photos';
import { definedPriceList } from '@/server/catalogue';
import { buildBundleLayout, buildLayout, decodeBundleLayout, decodeDrawing, encodeBundle, renderBundleLayers } from '@/server/print/bundleMockup';
import { renderTemplatePreview } from '@/server/print/compositor';
import type { Transform } from '@/server/print/geometry';
import { authorCtx, authorTemplate, BUNDLE_BACKDROP, bundleLayoutDir, TILE_LAYERS } from '@/server/print/seedMockups';
import { assertQuadFitsBlank } from '@/server/print/templates';

const EDGE = 1200;
const MANIFEST = path.join('src', 'lib', 'product-photos.json');

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const all = args.includes('--all');
const only = flag('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const drawingFile = flag('--drawing') ?? path.join('public', DEMO_DRAWING);

async function main() {
  const design = readFileSync(drawingFile);
  const dm = await sharp(design).metadata();
  const aspect = dm.width! / dm.height!;
  const outDir = path.join('public', PRODUCT_PHOTO_DIR);
  mkdirSync(outDir, { recursive: true });
  const manifest: Record<string, ProductPhoto> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

  // each product on show, at its DEFAULT variant (the one the shop shows first)
  const onShow = definedPriceList().filter((v) => v.visibleInShop && !v.paused && !BUNDLE_ONLY_SKUS.has(v.sku));
  const keys = [...new Set(onShow.map((v) => v.productKey))].filter((k) => (only ? only.includes(k) : all || !handMade(k)));
  const ctx = authorCtx();
  const notes: string[] = [];

  for (const key of keys) {
    const copy = SHOP_PRODUCTS[key];
    if (!copy) { notes.push(`${key}: no SHOP_PRODUCTS entry (no public page)`); continue; }
    const v = onShow.find((x) => x.productKey === key && x.isDefault) ?? onShow.find((x) => x.productKey === key)!;
    const placement = defaultPlacementFor(key, v.attributes, aspect) as Transform;
    let webp: Buffer | null = null;
    let how = '';

    if (key === BUNDLE_KEY || key in TILE_LAYERS) {
      // the flattened layouts (bundleCompose.ts): the family bundle's tile, the placemat / coaster tiles
      const built = key === BUNDLE_KEY
        ? (bundleLayoutDir('thumb') ? await buildBundleLayout(bundleLayoutDir('thumb')!, BUNDLE_BACKDROP) : null)
        : await tileLayout(key as keyof typeof TILE_LAYERS);
      if (!built) { notes.push(`${key}: layout layers not staged — skipped`); continue; }
      const layout = await decodeBundleLayout(built.base, built.regions, 2048);
      const drawing = await decodeDrawing(await sharp(design).resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).png().toBuffer());
      webp = (await encodeBundle(await renderBundleLayers(layout, () => drawing, key === BUNDLE_KEY ? undefined : placement))).buffer;
      how = 'layout';
    } else {
      if (!v.px) { notes.push(`${key}: no print canvas — skipped`); continue; }
      const a = await authorTemplate({ sku: v.sku, key, attrs: v.attributes, printWmm: v.mm.w, printHmm: v.mm.h, printWpx: v.px.w, printHpx: v.px.h }, ctx);
      if ('skip' in a) { notes.push(`${key}: ${a.skip} — skipped`); continue; }
      const t = a.template;
      // the seeder's own check — a photo whose template couldn't be seeded fails here too
      for (const q of [t.printQuad, ...(t.extraQuads ?? [])]) assertQuadFitsBlank(q, { warped: !!t.extraQuads?.length });
      webp = await renderTemplatePreview({
        blank: t.blank, mask: t.mask, overlay: t.overlay, quad: t.printQuad, extraQuads: t.extraQuads, materialClass: t.materialClass,
        design, productKey: key, transform: placement, size: 'zoom',
        print: { widthPx: v.px.w, heightPx: v.px.h, bleedMm: v.bleedMm, requiredDpi: v.dpi },
      });
      how = a.registration.mode;
    }

    // one size + format for every page: ≤ 1200 px, sRGB WebP, no metadata beyond the colour profile
    const { data, info } = await sharp(webp)
      .resize(EDGE, EDGE, { fit: 'inside', withoutEnlargement: true })
      .withMetadata({ icc: 'srgb' })
      .webp({ quality: 80, effort: 6 })
      .toBuffer({ resolveWithObject: true });
    const file = `${copy.slug}.webp`;
    writeFileSync(path.join(outDir, file), data);
    manifest[key] = { src: `/${PRODUCT_PHOTO_DIR}/${file}`, width: info.width, height: info.height };
    console.log(`${key.padEnd(18)} ${how.padEnd(28)} ${info.width}×${info.height}  ${(data.byteLength / 1024).toFixed(0)} KB  → ${path.join(outDir, file)}`);
  }

  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`→ ${MANIFEST}`);
  for (const n of notes) console.log(`note: ${n}`);
}

/** A product that already has a founder-made example photo (kept unless --all / --only). */
function handMade(key: string): boolean {
  const src = SHOP_PRODUCTS[key]?.image?.src ?? '';
  return src.startsWith('/examples/') || src.startsWith('/christmas/');
}

async function tileLayout(key: keyof typeof TILE_LAYERS) {
  const layers = TILE_LAYERS[key];
  if (!existsSync(BUNDLE_BACKDROP) || !layers.every((l) => existsSync(l.file))) return null;
  const m = await sharp(layers[0]!.file).metadata();
  return buildLayout(layers, [m.width!, m.height!], BUNDLE_BACKDROP);
}

void main();
