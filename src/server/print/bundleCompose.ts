import 'server-only';
import { and, eq, inArray, like } from 'drizzle-orm';
import { mockupViews, productVariants, storageObjects, templateAssets } from '@/db/schema';
import { getViewableAssetOrThrow, resolveAssetViewer } from '@/server/assets';
import { derivativeKey } from '@/storage';
import type { DbHandle } from '@/server/db';
import { BUNDLE_KEY, type BundleArt } from '@/lib/christmas-bundle';
import sharp from 'sharp';
import { ByteLru } from './previewCache';
import type { Transform } from './geometry';
import { decodeBundleLayout, decodeDrawing, encodeBundle, renderBundleLayers, type BundleLayoutName, type DecodedBundleLayout, type DecodedDrawing, type RegionRole } from './bundleMockup';
import { designBytes, persistDerivative, templateBytes, THUMB_DESIGN_EDGE, withLimit, type ComposeMemo, type MockupResult, type MockupSize } from './compositor';

/**
 * The CHRISTMAS FAMILY BUNDLE's pictures at run time (the maths is bundleMockup.ts): the seeded
 * layouts are read from mockup_views (+ their brand-safe, NON-child template assets) and kept decoded
 * in process, so a render is just the drawings + one pass + an encode.
 *  - the CATALOGUE TILE (composeMockup → composeLayoutTile): the shopper's one drawing on every piece,
 *    behind composeMockup's authz gate, stored as a write-once derivative of that drawing like every
 *    other tile (so the second look is a cache hit);
 *  - the BUILDER's picture of a size (renderBundlePreview): several drawings, EACH through the authz
 *    gate first; rendered in memory and handed straight back, never stored (a picture made of several
 *    keepsakes can't belong to just one of them, so nothing outlives a deleted drawing).
 */

/** Bump to re-render cached bundle tiles when the rendering changes. */
const BUNDLE_REV = 'b1';
/** Working sizes: the catalogue thumb, its zoom, and the builder's picture. */
const EDGE: Record<MockupSize | 'builder', number> = { thumb: 512, zoom: 1024, builder: 768 };

type Stored = { version: number; baseKey: string; regions: Array<{ role: RegionRole; index: number; quad: [number, number][]; weightKey: string }> };

/** A layout's stored rows (the latest version) on the variant `sku` owns it by. Null until the seed has authored it. */
async function storedLayout(db: DbHandle, layout: BundleLayoutName | 'tile', sku: string = BUNDLE_KEY): Promise<Stored | null> {
  const rows = await db
    .select({ view: mockupViews.view, v: mockupViews.templateVersion, blank: mockupViews.blankObjectId, mask: mockupViews.maskObjectId, quad: mockupViews.printQuad })
    .from(mockupViews)
    .innerJoin(productVariants, eq(productVariants.id, mockupViews.variantId))
    .where(and(eq(productVariants.sku, sku), like(mockupViews.view, `layout-${layout}-%`)));
  if (!rows.length) return null;
  const ids = [...new Set(rows.flatMap((r) => [r.blank, r.mask]).filter((x): x is string => !!x))];
  const keys = new Map((await db.select({ id: templateAssets.id, key: templateAssets.key }).from(templateAssets).where(inArray(templateAssets.id, ids))).map((r) => [r.id, r.key]));
  const baseKey = rows[0]!.blank ? keys.get(rows[0]!.blank) : undefined;
  if (!baseKey) return null;
  const regions: Stored['regions'] = [];
  for (const r of rows) {
    const m = /^layout-[a-z0-9]+-(placemat|coaster|ornament|square)-(\d+)$/.exec(r.view);
    const weightKey = r.mask ? keys.get(r.mask) : undefined;
    if (!m || !weightKey || !r.quad) continue;
    regions.push({ role: m[1] as RegionRole, index: Number(m[2]), quad: r.quad, weightKey });
  }
  return { version: Math.max(...rows.map((r) => r.v)), baseKey, regions };
}

/** Decoded layouts, by their (immutable, versioned) storage keys + working size. Brand-safe. */
const decoded = new ByteLru<DecodedBundleLayout>(64 * 1024 * 1024, (d) => d.base.byteLength + d.regions.reduce((n, r) => n + r.weight.byteLength, 0));
async function decodedLayout(s: Stored, edge: number): Promise<DecodedBundleLayout> {
  return decoded.get(`${s.baseKey}@${edge}`, async () =>
    decodeBundleLayout(await templateBytes(s.baseKey), await Promise.all(s.regions.map(async (r) => ({ role: r.role, index: r.index, quad: r.quad, weight: await templateBytes(r.weightKey) }))), edge),
  );
}

type SourceObject = { id: string; key: string; sha256: string | null };
const designTag = (o: SourceObject) => `${o.id}${o.sha256 ? `.${o.sha256.slice(0, 10)}` : ''}`;

/** Products whose catalogue + customize picture is a flattened layout (the founder's print maps, 29 Oct;
 * the multi photo frames, 5 Nov): product key → [the variant sku the layout is stored on — null = each
 * variant's OWN (a frame per size × colour) — and the layout]. */
const LAYOUT_PRODUCTS: Record<string, [string | null, BundleLayoutName | 'tile']> = {
  christmasBundle: [BUNDLE_KEY, 'thumb'], // the shopper's one drawing on every piece
  placemat: ['placemat', 'tile'],
  coaster: ['coaster', 'tile'],
  multiPhotoFrame: [null, 'tile'], // the shopper's one drawing in every square (the catalogue tile)
};
export const isLayoutProduct = (productKey: string | null | undefined): boolean => !!productKey && productKey in LAYOUT_PRODUCTS;
/** The sku a product's layout is stored on, for this variant. */
const layoutSku = (productKey: string, variantSku?: string): string | null => {
  const entry = LAYOUT_PRODUCTS[productKey];
  return entry ? (entry[0] ?? variantSku ?? null) : null;
};

/** A layout picture's derivative key — null while that product (variant) has no layout stored.
 * `placement` (a hash of the shopper's placement) for the standalone placemat / coaster + the frames. */
export async function layoutTileKey(db: DbHandle, productKey: string, assetId: string, srcObj: SourceObject, size: MockupSize, placement = '', variantSku?: string): Promise<string | null> {
  const [, layout] = LAYOUT_PRODUCTS[productKey] ?? [];
  const sku = layoutSku(productKey, variantSku);
  if (!sku || !layout) return null;
  const s = await storedLayout(db, layout, sku);
  // a per-variant layout names its variant (each frame colour + size is its own picture)
  const own = LAYOUT_PRODUCTS[productKey]![0] === null ? `-${sku}` : '';
  return s ? derivativeKey(assetId, `mockup-${productKey}${own}-${layout}-${size}-v${s.version}${BUNDLE_REV}-${designTag(srcObj)}${placement ? `-${placement}` : ''}`) : null;
}

/** Render + store a layout picture (the caller passed composeMockup's authz gate for this asset): the
 * one drawing on every print area, at the shopper's placement when given. */
export async function composeLayoutTile(db: DbHandle, args: { productKey: string; variantSku?: string; assetId: string; key: string; srcObj: SourceObject; size: MockupSize; placement?: Transform; memo?: ComposeMemo }): Promise<MockupResult> {
  const [, layout] = LAYOUT_PRODUCTS[args.productKey] ?? [];
  const sku = layoutSku(args.productKey, args.variantSku);
  const s = sku && layout ? await storedLayout(db, layout, sku) : null;
  if (!s) throw new Error('no layout yet');
  const [decodedL, drawing] = await Promise.all([
    decodedLayout(s, EDGE[args.size]),
    designBytes(args.srcObj.key, args.size === 'thumb' ? THUMB_DESIGN_EDGE : null, args.memo, { assetId: args.assetId, tag: designTag(args.srcObj) }).then(async (b) =>
      decodeDrawing(args.size === 'thumb' ? b : await sharp(b, { limitInputPixels: 50_000_000 }).resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 1 }).toBuffer()),
    ),
  ]);
  const out = await encodeBundle(await renderBundleLayers(decodedL, () => drawing, args.placement));
  const mockupObjectId = await persistDerivative(db, args.assetId, args.key, out.buffer);
  return { mockupObjectId, key: args.key, format: 'webp', tier: 'FLAT', cached: false, widthPx: out.width, heightPx: out.height };
}

/** Thrown when a drawing on a builder picture isn't the viewer's to see (→ 403). */
export class BundlePreviewDenied extends Error {}

/**
 * The BUILDER's picture of a size: the placemats' drawing, the coasters' (null = the placemats'), and
 * each ornament's. EVERY drawing passes the authz gate (assertCanViewAsset) before a byte of it is
 * read; a source object must belong to its asset. Returns the WebP — not stored anywhere.
 */
export async function renderBundlePreview(
  db: DbHandle,
  who: { accountId: string | null; uploadClaims: string[] },
  input: { layout: Exclude<BundleLayoutName, 'thumb'>; placemat: BundleArt; coaster: BundleArt | null; ornaments: BundleArt[] },
): Promise<{ webp: Buffer; ms: number } | null> {
  const t0 = performance.now();
  const arts = [input.placemat, input.coaster ?? input.placemat, ...input.ornaments];
  for (const id of new Set(arts.map((a) => a.assetId))) {
    const viewer = await resolveAssetViewer(db, id, who.accountId, who.uploadClaims);
    try {
      await getViewableAssetOrThrow(db, id, viewer); // ← assertCanViewAsset; throws on deny
    } catch {
      throw new BundlePreviewDenied('not yours to see');
    }
  }
  const s = await storedLayout(db, input.layout);
  if (!s) return null;
  // each distinct drawing: its stored object (scoped to its asset), shrunk + decoded once
  const memo: ComposeMemo = new Map();
  const byArt = new Map<string, Promise<DecodedDrawing>>();
  const drawingOf = (a: BundleArt) => {
    const k = `${a.assetId}|${a.sourceObjectId ?? ''}`;
    let p = byArt.get(k);
    if (!p) {
      p = (async () => {
        const [o] = a.sourceObjectId
          ? await db.select().from(storageObjects).where(and(eq(storageObjects.id, a.sourceObjectId), eq(storageObjects.assetId, a.assetId)))
          : await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, a.assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
        if (!o) throw new BundlePreviewDenied('no such drawing');
        return decodeDrawing(await designBytes(o.key, THUMB_DESIGN_EDGE, memo, { assetId: a.assetId, tag: designTag(o) }));
      })();
      byArt.set(k, p);
    }
    return p;
  };
  const [layout, placemat, coaster, ...ornaments] = await Promise.all([decodedLayout(s, EDGE.builder), ...arts.map(drawingOf)]);
  const pick = (role: RegionRole, i: number) => (role === 'placemat' ? placemat! : role === 'coaster' ? coaster! : (ornaments[i] ?? placemat!));
  const out = await withLimit(async () => encodeBundle(await renderBundleLayers(layout, pick)));
  return { webp: out.buffer, ms: Math.round(performance.now() - t0) };
}

/** Is there a builder picture for this frame variant (its layout seeded)? */
export async function hasFrameLayout(db: DbHandle, variantSku: string): Promise<boolean> {
  return (await storedLayout(db, 'tile', variantSku)) !== null;
}

/**
 * The MULTI PHOTO FRAME builder's picture: the founder's frame (that size, that colour) with each
 * square's own drawing at its own placement. EVERY distinct drawing passes the authz gate
 * (assertCanViewAsset) before a byte of it is read; a source object must belong to its asset. Rendered in
 * memory and handed straight back — never stored (a picture of several keepsakes can't belong to one).
 */
export async function renderFramePreview(
  db: DbHandle,
  who: { accountId: string | null; uploadClaims: string[] },
  input: { variantSku: string; squares: Array<{ assetId: string; sourceObjectId?: string | null; transform?: Transform }> },
): Promise<{ webp: Buffer; ms: number } | null> {
  const t0 = performance.now();
  for (const id of new Set(input.squares.map((a) => a.assetId))) {
    const viewer = await resolveAssetViewer(db, id, who.accountId, who.uploadClaims);
    try {
      await getViewableAssetOrThrow(db, id, viewer); // ← assertCanViewAsset; throws on deny
    } catch {
      throw new BundlePreviewDenied('not yours to see');
    }
  }
  const s = await storedLayout(db, 'tile', input.variantSku);
  if (!s) return null;
  const memo: ComposeMemo = new Map();
  const byArt = new Map<string, Promise<DecodedDrawing>>();
  const drawingOf = (a: { assetId: string; sourceObjectId?: string | null }) => {
    const k = `${a.assetId}|${a.sourceObjectId ?? ''}`;
    let p = byArt.get(k);
    if (!p) {
      p = (async () => {
        const [o] = a.sourceObjectId
          ? await db.select().from(storageObjects).where(and(eq(storageObjects.id, a.sourceObjectId), eq(storageObjects.assetId, a.assetId)))
          : await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, a.assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
        if (!o) throw new BundlePreviewDenied('no such drawing');
        return decodeDrawing(await designBytes(o.key, THUMB_DESIGN_EDGE, memo, { assetId: a.assetId, tag: designTag(o) }));
      })();
      byArt.set(k, p);
    }
    return p;
  };
  const [layout, ...drawings] = await Promise.all([decodedLayout(s, EDGE.builder), ...input.squares.map(drawingOf)]);
  const out = await withLimit(async () =>
    encodeBundle(await renderBundleLayers(layout, (role, i) => (role === 'square' ? (drawings[i] ?? null) : null), undefined, (role, i) => (role === 'square' ? input.squares[i]?.transform : undefined))),
  );
  return { webp: out.buffer, ms: Math.round(performance.now() - t0) };
}
