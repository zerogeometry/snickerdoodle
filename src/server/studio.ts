import { and, eq } from 'drizzle-orm';
import { canViewAsset, type AssetRef } from '@/authz';
import { assets, printTemplates, productVariants, products, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { presignDownload } from '@/storage';
import { ensureHomeFamily } from './onboarding';
import { resolveViewerContext } from './assets';
import { getCurrentAccount } from './session';

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

  // printable product variants (those with a print template)
  const vrows = await db
    .select({ v: productVariants, p: products, t: printTemplates })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
    .where(and(eq(products.active, true), eq(productVariants.active, true)));

  const variants: StudioVariant[] = vrows.map(({ v, p, t }) => ({
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

  return { keepsakes, variants };
}
