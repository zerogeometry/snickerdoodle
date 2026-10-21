import 'server-only';
import './sharp-init';
import sharp from 'sharp';
import { eq, inArray } from 'drizzle-orm';
import { printTemplates, products, productVariants, templateAssets } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import { isPatternProduct } from '@/lib/patterns';
import { getObjectBytes, presignDownload, putObject } from '@/storage';
import { isHeightChart } from './height-chart-geometry';
import type { InstantContext } from '@/lib/instantMockup';

/** The small photo the browser composes on (the catalogue tile is ~200px; 2× for sharp screens). */
const THUMB_EDGE = 600;
const URL_TTL_S = 900;

/**
 * What the BROWSER needs to draw an instant preview of a drawing on a product, before the server's
 * photoreal mockup is ready: a small copy of the brand-safe product photo (+ its silhouette mask and
 * foreground overlay) and the print area. Structurally NON-child data — the same imagery every
 * shopper sees — so no viewer gate (like the positioner's product context). The child's drawing
 * never comes here: the browser already holds it.
 *
 * Only for previews the browser can draw faithfully with the SAME placement geometry: a flat
 * (axis-aligned) print area on the primary view. A mug (cylinder wrap), an angled view
 * (perspective), a repeat pattern or a height chart (the printed face) → null; those tiles wait
 * for the server's mockup, and the catalogue asks for them first.
 */
export async function instantContexts(db: DbHandle, variantIds: string[]): Promise<Record<string, InstantContext | null>> {
  const out: Record<string, InstantContext | null> = {};
  if (variantIds.length === 0) return out;
  const rows = await db
    .select({ variantId: printTemplates.variantId, t: printTemplates, key: products.key })
    .from(printTemplates)
    .innerJoin(productVariants, eq(productVariants.id, printTemplates.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(printTemplates.variantId, variantIds));
  const assetIds = [...new Set(rows.flatMap((r) => [r.t.blankObjectId, r.t.maskObjectId, r.t.lightingObjectId]).filter((x): x is string => !!x))];
  const assets = assetIds.length ? await db.select().from(templateAssets).where(inArray(templateAssets.id, assetIds)) : [];
  const byId = new Map(assets.map((a) => [a.id, a]));

  await Promise.all(
    variantIds.map(async (id) => {
      const r = rows.find((x) => x.variantId === id);
      const t = r?.t;
      const blank = t?.blankObjectId ? byId.get(t.blankObjectId) : undefined;
      const quad = t?.printQuad;
      const cylinder = t?.materialClass === 'CERAMIC' && !!t.maskObjectId;
      if (!r || !t || !blank?.widthPx || !blank.heightPx || !quad || !axisAligned(quad) || cylinder || isPatternProduct(r.key) || isHeightChart(r.key)) {
        out[id] = null;
        return;
      }
      const mask = t.maskObjectId ? byId.get(t.maskObjectId) : undefined;
      const overlay = t.lightingObjectId ? byId.get(t.lightingObjectId) : undefined;
      try {
        out[id] = {
          blankUrl: await thumbUrl(blank.key),
          maskUrl: mask ? await thumbUrl(mask.key) : null,
          overlayUrl: overlay ? await thumbUrl(overlay.key) : null,
          quad,
          blankW: blank.widthPx,
          blankH: blank.heightPx,
          material: t.materialClass,
          print: { printWidthPx: t.printWidthPx, printHeightPx: t.printHeightPx, bleedMm: t.bleedMm, requiredDpi: t.requiredDpi },
        };
      } catch {
        out[id] = null; // an instant preview is a nicety — the server mockup still comes
      }
    }),
  );
  return out;
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
