import { and, eq } from 'drizzle-orm';
import { canViewAsset } from '@/authz';
import { assets, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { presignDownload } from '@/storage';
import { ensureHomeFamily } from './onboarding';
import { assetRefOf, getViewableAssetOrThrow, resolveAssetViewer, resolveViewerContext } from './assets';
import { getCurrentAccount, getUploadClaims } from './session';
import { loadPrintableVariants, type StudioVariant } from './studio-variants';

export type { StudioTemplate, StudioVariant } from './studio-variants';
export interface StudioKeepsake {
  id: string;
  imageUrl: string;
  /** The design the parent is placing, when it isn't the original (a Studio save / a lifted
   * cutout) — checked to belong to this keepsake. The editor shows and places THIS. */
  design?: { url: string; sourceObjectId: string };
}
export interface StudioData {
  keepsakes: StudioKeepsake[];
  variants: StudioVariant[];
}

/**
 * The design a parent asked to place (?source=…): only a DERIVATIVE of THIS asset (its Studio design
 * or cutout) — never another asset's object, never a template. Anything else is ignored and the
 * editor falls back to the original. Called only after the asset itself passed the gate.
 */
async function designOf(db: ReturnType<typeof getDb>, assetId: string, sourceObjectId: string | undefined): Promise<StudioKeepsake['design'] | null> {
  if (!sourceObjectId || !/^[0-9a-f-]{36}$/i.test(sourceObjectId)) return null;
  const [o] = await db
    .select({ id: storageObjects.id, key: storageObjects.key })
    .from(storageObjects)
    .where(and(eq(storageObjects.id, sourceObjectId), eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'DERIVATIVE')));
  return o ? { url: await presignDownload(o.key, 600), sourceObjectId: o.id } : null;
}

const refOf = assetRefOf;

/** Everything the positioning editor needs for the signed-in account — null for a guest.
 * `focusVariantId` scopes the editor to the ONE variant Customize sent us (see
 * loadPrintableVariants). */
export async function loadStudioData(focusVariantId?: string, sourceObjectId?: string): Promise<StudioData | null> {
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
    const design = await designOf(db, r.asset.id, sourceObjectId);
    keepsakes.push({ id: r.asset.id, imageUrl: await presignDownload(r.key, 600), ...(design ? { design } : {}) });
  }

  return { keepsakes, variants: await loadPrintableVariants(db, focusVariantId) };
}

/**
 * The editor for a SINGLE pre-account ephemeral draft (the guest buy flow): the
 * viewer is resolved by membership OR the held upload claim, and the asset is
 * gated through the same canViewAsset chokepoint. Returns null if the draft isn't
 * accessible (no/expired claim, blocked, or gone) so the page can send them back
 * to start a new one.
 */
export async function loadDraftStudioData(assetId: string, focusVariantId?: string, sourceObjectId?: string): Promise<StudioData | null> {
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
    keepsakes: [{ id: assetId, imageUrl: await presignDownload(obj.key, 600), ...((d) => (d ? { design: d } : {}))(await designOf(db, assetId, sourceObjectId)) }],
    variants: await loadPrintableVariants(db, focusVariantId),
  };
}
