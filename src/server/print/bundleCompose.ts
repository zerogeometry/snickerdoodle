import 'server-only';
import { and, eq, inArray, like } from 'drizzle-orm';
import { mockupViews, productVariants, storageObjects, templateAssets } from '@/db/schema';
import { getViewableAssetOrThrow, resolveAssetViewer } from '@/server/assets';
import { derivativeKey } from '@/storage';
import type { DbHandle } from '@/server/db';
import { BUNDLE_KEY, type BundleArt } from '@/lib/christmas-bundle';
import { ByteLru } from './previewCache';
import { decodeBundleLayout, decodeDrawing, encodeBundle, renderBundleLayers, type BundleLayoutName, type DecodedBundleLayout, type DecodedDrawing, type RegionRole } from './bundleMockup';
import { designBytes, persistDerivative, templateBytes, THUMB_DESIGN_EDGE, withLimit, type ComposeMemo, type MockupResult, type MockupSize } from './compositor';

/**
 * The CHRISTMAS FAMILY BUNDLE's pictures at run time (the maths is bundleMockup.ts): the seeded
 * layouts are read from mockup_views (+ their brand-safe, NON-child template assets) and kept decoded
 * in process, so a render is just the drawings + one pass + an encode.
 *  - the CATALOGUE TILE (composeMockup → composeBundleTile): the shopper's one drawing on every piece,
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

/** A layout's stored rows (the latest version). Null until the seed has authored it. */
async function storedLayout(db: DbHandle, layout: BundleLayoutName): Promise<Stored | null> {
  const rows = await db
    .select({ view: mockupViews.view, v: mockupViews.templateVersion, blank: mockupViews.blankObjectId, mask: mockupViews.maskObjectId, quad: mockupViews.printQuad })
    .from(mockupViews)
    .innerJoin(productVariants, eq(productVariants.id, mockupViews.variantId))
    .where(and(eq(productVariants.sku, BUNDLE_KEY), like(mockupViews.view, `bundle-${layout}-%`)));
  if (!rows.length) return null;
  const ids = [...new Set(rows.flatMap((r) => [r.blank, r.mask]).filter((x): x is string => !!x))];
  const keys = new Map((await db.select({ id: templateAssets.id, key: templateAssets.key }).from(templateAssets).where(inArray(templateAssets.id, ids))).map((r) => [r.id, r.key]));
  const baseKey = rows[0]!.blank ? keys.get(rows[0]!.blank) : undefined;
  if (!baseKey) return null;
  const regions: Stored['regions'] = [];
  for (const r of rows) {
    const m = /^bundle-[a-z0-9]+-(placemat|coaster|ornament)-(\d+)$/.exec(r.view);
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

/** The catalogue tile's derivative key — null while the bundle has no tile layout. */
export async function bundleTileKey(db: DbHandle, assetId: string, srcObj: SourceObject, size: MockupSize): Promise<string | null> {
  const s = await storedLayout(db, 'thumb');
  return s ? derivativeKey(assetId, `mockup-bundle-thumb-${size}-v${s.version}${BUNDLE_REV}-${designTag(srcObj)}`) : null;
}

/** Render + store the catalogue tile (the caller passed composeMockup's authz gate for this asset). */
export async function composeBundleTile(db: DbHandle, args: { assetId: string; key: string; srcObj: SourceObject; size: MockupSize; memo?: ComposeMemo }): Promise<MockupResult> {
  const s = await storedLayout(db, 'thumb');
  if (!s) throw new Error('the bundle has no layout yet');
  const [layout, drawing] = await Promise.all([
    decodedLayout(s, EDGE[args.size]),
    designBytes(args.srcObj.key, THUMB_DESIGN_EDGE, args.memo, { assetId: args.assetId, tag: designTag(args.srcObj) }).then(decodeDrawing),
  ]);
  const out = await encodeBundle(await renderBundleLayers(layout, () => drawing));
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
