import 'server-only';
import './sharp-init';
import sharp from 'sharp';
import { and, eq, inArray } from 'drizzle-orm';
import { mockupViews, printTemplates, products, productVariants, templateAssets } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import { isPatternProduct } from '@/lib/patterns';
import { isMultiPhotoFrameKey } from '@/lib/multi-photo-frame';
import { isBundleKey } from '@/lib/christmas-bundle';
import { isWatchStrap } from '@/lib/watch-strap';
import { getObjectBytes, presignDownload, putObject } from '@/storage';
import { isHeightChart } from './height-chart-geometry';
import { isGalleryProduct } from './geometry';
import { isLayoutProduct } from './bundleCompose';
import type { InstantContext, ProductPhoto } from '@/lib/instantMockup';

/** The small photo the browser composes on (a range tile's photo is ≤ 350 css px; 2× for sharp screens). */
const THUMB_EDGE = 600;
const URL_TTL_S = 900;

/**
 * Why a product's range tile can't be drawn in the browser — it waits for the server's picture (and
 * the range asks for those first). Null = the browser draws it faithfully: a FLAT print area (an
 * axis-aligned quad on the primary photo) with the drawing placed by the SAME geometry as the
 * compositor, clipped by the photo's mask, under its overlay — or the calendar's page (the whole
 * drawing in its white margin, galleryRect). The finish (fabric folds, linear-light blend) is the
 * only difference.
 */
export function serverOnlyReason(t: { key: string; quad: [number, number][] | null; materialClass: string; hasMask: boolean; extraQuads: number }): string | null {
  if (isBundleKey(t.key) || isLayoutProduct(t.key)) return 'a layout of several pieces'; // the bundle, placemats, coasters, the multi photo frame
  if (isPatternProduct(t.key)) return 'a repeat pattern (the printed face)';
  if (isHeightChart(t.key)) return 'the drawing + ruler (the printed face)';
  if (isMultiPhotoFrameKey(t.key)) return 'a grid of squares (the printed face)';
  if (isWatchStrap(t.key)) return 'laid half by half onto the strap (the printed face)';
  if (!t.quad) return 'no print area';
  if (t.extraQuads > 0) return 'several print areas';
  if (t.materialClass === 'CERAMIC' && t.hasMask) return 'wrapped round a cylinder (a mug)';
  if (!axisAligned(t.quad)) return 'an angled print area (a perspective warp)';
  return null;
}

/**
 * What the BROWSER needs while the server's photoreal mockup is made — structurally NON-child data
 * (the same brand-safe imagery every shopper sees), so no viewer gate, like the positioner's product
 * context. The child's drawing never comes here: the browser already holds it.
 *  - `contexts`: for a product the browser can draw ({@link serverOnlyReason} = null), a small copy of
 *    the product photo (+ its silhouette mask and foreground overlay) and the print area.
 *  - `photos`: for every other one, just the small product photo (+ overlay) — the tile shows the plain
 *    product while its picture is made, never a blank square. `views` names a tile's alternate view
 *    (the mug's centred wrap) so the stand-in is the very photo the picture is made on.
 */
export async function instantContexts(
  db: DbHandle,
  variantIds: string[],
  views: Record<string, string> = {},
): Promise<{ contexts: Record<string, InstantContext | null>; photos: Record<string, ProductPhoto | null> }> {
  const contexts: Record<string, InstantContext | null> = {};
  const photos: Record<string, ProductPhoto | null> = {};
  if (variantIds.length === 0) return { contexts, photos };
  const [rows, viewRows] = await Promise.all([
    db
      .select({ variantId: productVariants.id, key: products.key, t: printTemplates })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
      .where(inArray(productVariants.id, variantIds)),
    Object.keys(views).length
      ? db.select().from(mockupViews).where(and(inArray(mockupViews.variantId, Object.keys(views)), inArray(mockupViews.view, [...new Set(Object.values(views))])))
      : Promise.resolve([] as (typeof mockupViews.$inferSelect)[]),
  ]);
  const viewOf = (id: string) => (views[id] ? viewRows.find((v) => v.variantId === id && v.view === views[id]) : undefined);
  const assetIds = [
    ...new Set(
      [...rows.flatMap((r) => [r.t?.blankObjectId, r.t?.maskObjectId, r.t?.lightingObjectId]), ...viewRows.flatMap((v) => [v.blankObjectId, v.overlayObjectId])].filter((x): x is string => !!x),
    ),
  ];
  const assets = assetIds.length ? await db.select().from(templateAssets).where(inArray(templateAssets.id, assetIds)) : [];
  const byId = new Map(assets.map((a) => [a.id, a]));

  await Promise.all(
    variantIds.map(async (id) => {
      contexts[id] = null;
      photos[id] = null;
      const r = rows.find((x) => x.variantId === id);
      if (!r) return;
      const t = r.t;
      try {
        const view = viewOf(id);
        if (views[id]) {
          // an alternate view (the mug's centred wrap): its photo stands in; never drawn here
          const blank = view?.blankObjectId ? byId.get(view.blankObjectId) : undefined;
          const overlay = view?.overlayObjectId ? byId.get(view.overlayObjectId) : undefined;
          if (blank?.widthPx && blank.heightPx) photos[id] = { url: await thumbUrl(blank.key), overlayUrl: overlay ? await thumbUrl(overlay.key) : null, w: blank.widthPx, h: blank.heightPx };
          return;
        }
        const blank = t?.blankObjectId ? byId.get(t.blankObjectId) : undefined;
        const mask = t?.maskObjectId ? byId.get(t.maskObjectId) : undefined;
        const overlay = t?.lightingObjectId ? byId.get(t.lightingObjectId) : undefined;
        const why = serverOnlyReason({ key: r.key, quad: t?.printQuad ?? null, materialClass: t?.materialClass ?? '', hasMask: !!mask, extraQuads: t?.extraQuads?.length ?? 0 });
        if (!why && t && t.printQuad && blank?.widthPx && blank.heightPx) {
          contexts[id] = {
            blankUrl: await thumbUrl(blank.key),
            maskUrl: mask ? await thumbUrl(mask.key) : null,
            overlayUrl: overlay ? await thumbUrl(overlay.key) : null,
            quad: t.printQuad,
            blankW: blank.widthPx,
            blankH: blank.heightPx,
            material: t.materialClass,
            print: { printWidthPx: t.printWidthPx, printHeightPx: t.printHeightPx, bleedMm: t.bleedMm, requiredDpi: t.requiredDpi },
            ...(isGalleryProduct(r.key) ? { face: 'gallery' as const } : {}),
          };
          return;
        }
        // the picture is the server's: the plain product photo stands in meanwhile — except a layout of
        // pieces, whose photo is authored with its print areas BLACK (they're the regions the drawings
        // go in): that's no picture of the product, so those tiles keep their calm block
        if (isBundleKey(r.key) || isLayoutProduct(r.key)) return;
        if (blank?.widthPx && blank.heightPx) photos[id] = { url: await thumbUrl(blank.key), overlayUrl: overlay ? await thumbUrl(overlay.key) : null, w: blank.widthPx, h: blank.heightPx };
      } catch {
        // a nicety either way — the server's picture still comes
      }
    }),
  );
  return { contexts, photos };
}

function axisAligned(q: [number, number][]): boolean {
  const [tl, tr, br, bl] = q as [[number, number], [number, number], [number, number], [number, number]];
  const tol = 0.004;
  return Math.abs(tl[0] - bl[0]) < tol && Math.abs(tr[0] - br[0]) < tol && Math.abs(tl[1] - tr[1]) < tol && Math.abs(bl[1] - br[1]) < tol;
}

// A template layer's small copy lives beside it (template keys are versioned → immutable, so the
// copy never goes stale). Made once, on first ask; remembered per process.
const made = new Set<string>();
async function thumbUrl(key: string): Promise<string> {
  const small = `${key}.t${THUMB_EDGE}.webp`;
  if (!made.has(small)) {
    try {
      await getObjectBytes(small);
    } catch {
      const buf = await sharp(await getObjectBytes(key), { limitInputPixels: 50_000_000 })
        .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 90 })
        .toBuffer();
      await putObject(small, buf, 'image/webp');
    }
    made.add(small);
  }
  return presignDownload(small, URL_TTL_S);
}
