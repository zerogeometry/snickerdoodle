import { and, desc, eq } from 'drizzle-orm';
import { assertCanViewAsset, canViewAsset } from '@/authz';
import { assets, products, productVariants, savedDesigns, storageObjects } from '@/db/schema';
import { presignDownload } from '@/storage';
import { clampTransform, type RawTransform } from '@/server/print/geometry';
import { normalizeCushionBack } from '@/lib/catalogue-view';
import type { DbHandle } from './db';
import { resolveViewerContext } from './assets';
import { keepAndFileCreations } from './keepsakes';

/** Products that can be saved/gifted as a design (a card needs its buyer's own inside message; a card
 * pack is built from N drawings at the basket). */
const NOT_SAVABLE = new Set(['card', 'cardPack']);

export interface SaveDesignInput {
  assetId: string;
  variantSku: string;
  transform: RawTransform;
  sourceObjectId?: string | null;
  back?: string | null;
}

/**
 * "+ Keepsake": save a drawing-on-a-product for later. A guest's draft is first kept into the
 * account's family (the same adoption path as checkout); then the design is stored against the
 * asset's family. Authz: the account must be able to SEE the asset (central policy); the variant
 * must be a live shop product; the placement is clamped server-side.
 */
export async function saveDesign(
  db: DbHandle,
  account: { id: string; name: string | null },
  uploadClaims: string[],
  input: SaveDesignInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: 'not-found' | 'not-savable' }> {
  await keepAndFileCreations(db, account, uploadClaims, [input.assetId]);
  const [asset] = await db.select().from(assets).where(eq(assets.id, input.assetId));
  if (!asset?.familyId || !asset.keptInHome) return { ok: false, reason: 'not-found' };
  const viewer = await resolveViewerContext(db, account.id, asset.familyId);
  assertCanViewAsset(
    { id: asset.id, familyId: asset.familyId, uploaderAccountId: asset.uploaderAccountId, controllerAccountId: asset.controllerAccountId, visibility: asset.visibility },
    viewer,
  );

  const [variant] = await db
    .select({ sku: productVariants.sku, productKey: products.key, inShop: products.visibleInShop })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.sku, input.variantSku), eq(productVariants.active, true), eq(products.active, true)));
  if (!variant || !variant.inShop || NOT_SAVABLE.has(variant.productKey)) return { ok: false, reason: 'not-savable' };

  let sourceObjectId: string | null = null;
  if (input.sourceObjectId) {
    const [so] = await db
      .select({ id: storageObjects.id })
      .from(storageObjects)
      .where(and(eq(storageObjects.id, input.sourceObjectId), eq(storageObjects.assetId, asset.id)));
    sourceObjectId = so?.id ?? null;
  }

  const [row] = await db
    .insert(savedDesigns)
    .values({
      familyId: asset.familyId,
      createdByAccountId: account.id,
      assetId: asset.id,
      variantSku: variant.sku,
      transform: clampTransform(input.transform),
      sourceObjectId,
      back: normalizeCushionBack(input.back ?? undefined),
    })
    .returning({ id: savedDesigns.id });
  return { ok: true, id: row!.id };
}

export interface SavedDesignView {
  id: string;
  assetId: string;
  variantSku: string;
  productKey: string;
  label: string; // "mug · blue"
  pricePence: number;
  imageUrl: string | null;
  createdAtISO: string;
}

/** The account's saved designs in a family — only those whose drawing they can still see. */
export async function listSavedDesigns(db: DbHandle, accountId: string, familyId: string): Promise<SavedDesignView[]> {
  const viewer = await resolveViewerContext(db, accountId, familyId);
  const rows = await db
    .select({ d: savedDesigns, a: assets, v: productVariants, p: products, key: storageObjects.key })
    .from(savedDesigns)
    .innerJoin(assets, eq(assets.id, savedDesigns.assetId))
    .innerJoin(productVariants, eq(productVariants.sku, savedDesigns.variantSku))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(storageObjects, and(eq(storageObjects.assetId, assets.id), eq(storageObjects.objectClass, 'ORIGINAL')))
    .where(and(eq(savedDesigns.familyId, familyId), eq(savedDesigns.createdByAccountId, accountId)))
    .orderBy(desc(savedDesigns.createdAt));
  const out: SavedDesignView[] = [];
  for (const { d, a, v, p, key } of rows) {
    const ref = { id: a.id, familyId: a.familyId, uploaderAccountId: a.uploaderAccountId, controllerAccountId: a.controllerAccountId, visibility: a.visibility };
    if (!canViewAsset(ref, viewer).allowed || a.moderationStatus === 'BLOCKED') continue;
    const attrs = (v.attributes as Record<string, string>) ?? {};
    const detail = [attrs.size, attrs.colour].filter(Boolean).join(' · ');
    out.push({
      id: d.id,
      assetId: a.id,
      variantSku: v.sku,
      productKey: p.key,
      label: detail ? `${p.label} · ${detail}` : p.label,
      pricePence: v.pricePence,
      imageUrl: key ? await presignDownload(key, 300) : null,
      createdAtISO: d.createdAt.toISOString(),
    });
  }
  return out;
}

/** Remove a saved design (only the account that saved it). */
export async function deleteSavedDesign(db: DbHandle, accountId: string, id: string): Promise<boolean> {
  const res = await db
    .delete(savedDesigns)
    .where(and(eq(savedDesigns.id, id), eq(savedDesigns.createdByAccountId, accountId)))
    .returning({ id: savedDesigns.id });
  return res.length > 0;
}
