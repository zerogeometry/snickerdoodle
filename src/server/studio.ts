import { and, eq } from 'drizzle-orm';
import { canViewAsset, type AssetRef } from '@/authz';
import { assets, printTemplates, productVariants, products, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { presignDownload } from '@/storage';
import type { DbHandle } from './db';
import { ensureHomeFamily } from './onboarding';
import { getViewableAssetOrThrow, resolveAssetViewer, resolveViewerContext } from './assets';
import { getCurrentAccount, getUploadClaims } from './session';

export interface StudioTemplate {
  printWidthPx: number;
  printHeightPx: number;
  bleedMm: number;
  safeInsetMm: number;
  requiredDpi: number;
}
export interface StudioVariant {
  id: string;
  productKey: string;
  label: string;
  pricePence: number;
  template: StudioTemplate;
}
export interface StudioKeepsake {
  id: string;
  imageUrl: string;
}
export interface StudioData {
  keepsakes: StudioKeepsake[];
  variants: StudioVariant[];
}

function refOf(row: typeof assets.$inferSelect): AssetRef {
  return {
    id: row.id,
    familyId: row.familyId,
    uploaderAccountId: row.uploaderAccountId,
    controllerAccountId: row.controllerAccountId,
    visibility: row.visibility,
  };
}

/** Everything the positioning editor needs for the signed-in account — null for a guest. */
export async function loadStudioData(): Promise<StudioData | null> {
  const account = await getCurrentAccount();
  if (!account) return null;

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);

  // kept keepsakes the viewer may see, with a signed URL to the ORIGINAL
  const rows = await db
    .select({ asset: assets, key: storageObjects.key })
    .from(assets)
    .leftJoin(storageObjects, and(eq(storageObjects.assetId, assets.id), eq(storageObjects.objectClass, 'ORIGINAL')))
    .where(and(eq(assets.familyId, familyId), eq(assets.keptInHome, true)));

  const keepsakes: StudioKeepsake[] = [];
  for (const r of rows) {
    if (!r.key) continue;
    if (!canViewAsset(refOf(r.asset), viewer).allowed) continue;
    if (r.asset.moderationStatus === 'BLOCKED') continue; // CSAM-blocked content is never served
    keepsakes.push({ id: r.asset.id, imageUrl: await presignDownload(r.key, 600) });
  }

  return { keepsakes, variants: await loadPrintableVariants(db) };
}

/** The printable product variants (those with a print template) — shared by the
 * member and guest-draft editors. */
async function loadPrintableVariants(db: DbHandle): Promise<StudioVariant[]> {
  const vrows = await db
    .select({ v: productVariants, p: products, t: printTemplates })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
    // One representative (the default) per product — the studio places at product
    // level; size/colour are chosen in Customize.
    .where(and(eq(products.active, true), eq(productVariants.active, true), eq(productVariants.isDefault, true)));

  return vrows.map(({ v, p, t }) => ({
    id: v.id,
    productKey: p.key,
    label: p.label,
    pricePence: v.pricePence,
    template: {
      printWidthPx: t.printWidthPx,
      printHeightPx: t.printHeightPx,
      bleedMm: t.bleedMm,
      safeInsetMm: t.safeInsetMm,
      requiredDpi: t.requiredDpi,
    },
  }));
}

/**
 * The editor for a SINGLE pre-account ephemeral draft (the guest buy flow): the
 * viewer is resolved by membership OR the held upload claim, and the asset is
 * gated through the same canViewAsset chokepoint. Returns null if the draft isn't
 * accessible (no/expired claim, blocked, or gone) so the page can send them back
 * to start a new one.
 */
export async function loadDraftStudioData(assetId: string): Promise<StudioData | null> {
  const db = getDb();
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const viewer = await resolveAssetViewer(db, assetId, account?.id ?? null, claims);

  try {
    await getViewableAssetOrThrow(db, assetId, viewer); // gate (also rejects BLOCKED)
  } catch {
    return null;
  }
  const [obj] = await db
    .select({ key: storageObjects.key })
    .from(storageObjects)
    .where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!obj?.key) return null;

  return {
    keepsakes: [{ id: assetId, imageUrl: await presignDownload(obj.key, 600) }],
    variants: await loadPrintableVariants(db),
  };
}
