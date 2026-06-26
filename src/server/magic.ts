import { and, eq, gte } from 'drizzle-orm';
import { mlOperations, storageObjects } from '@/db/schema';
import { runImageOp } from '@/ml/client';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from './db';
import { getViewableAssetOrThrow } from './assets';

const PER_CREATION = Number(process.env.ML_BUDGET_PER_CREATION ?? 20);
const PER_ACCOUNT_30D = Number(process.env.ML_BUDGET_PER_ACCOUNT ?? 500);
const MS_30D = 30 * 86_400_000;

/** Per-creation and per-account budget caps on the self-hosted image ops. The
 * per-account cap applies only to a signed-in account; a guest op is bounded by
 * the per-creation cap alone (keyed on the asset). */
export async function assertMlBudget(db: DbHandle, accountId: string | null, assetId: string): Promise<void> {
  const perAsset = await db.select({ id: mlOperations.id }).from(mlOperations).where(eq(mlOperations.assetId, assetId));
  if (perAsset.length >= PER_CREATION) throw new Error('ml budget exceeded for this creation');
  if (accountId === null) return; // guest: per-creation cap only
  const since = new Date(Date.now() - MS_30D);
  const perAccount = await db
    .select({ id: mlOperations.id })
    .from(mlOperations)
    .where(and(eq(mlOperations.accountId, accountId), gte(mlOperations.createdAt, since)));
  if (perAccount.length >= PER_ACCOUNT_30D) throw new Error('ml budget exceeded for this account');
}

export interface MagicResult {
  objectId: string;
  key: string;
}

/**
 * "Remove background" magic edit: authz-gated + budget-capped, runs the
 * self-hosted op on the asset's ORIGINAL (single image, no EXIF), stores the
 * cutout as a DERIVATIVE, and records the op against the budget. The original is
 * never touched.
 */
export async function removeBackgroundForAsset(db: DbHandle, viewer: ViewerContext, assetId: string): Promise<MagicResult> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate (member OR upload-claim holder)
  await assertMlBudget(db, viewer.accountId, assetId);

  const [orig] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!orig) throw new Error('no original to edit');

  const srcBuf = await getObjectBytes(orig.key);
  const res = await runImageOp({ kind: 'BG_REMOVE' }, srcBuf); // self-hosted; one image; PNG, no EXIF

  const key = derivativeKey(assetId, 'cutout');
  await putObject(key, res.buffer, res.contentType);
  const { bucket } = getS3();

  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  let objectId: string;
  if (existing) {
    await db.update(storageObjects).set({ byteSize: res.byteSize, sha256: res.sha256 }).where(eq(storageObjects.id, existing.id));
    objectId = existing.id;
  } else {
    const [row] = await db
      .insert(storageObjects)
      .values({ assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: res.contentType, byteSize: res.byteSize, sha256: res.sha256, exifStripped: true, writeOnce: false })
      .returning();
    objectId = row!.id;
  }

  await db.insert(mlOperations).values({ accountId: viewer.accountId, op: 'BG_REMOVE', assetId });
  return { objectId, key };
}
