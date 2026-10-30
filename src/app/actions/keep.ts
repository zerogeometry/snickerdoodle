'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { assets } from '@/db/schema';
import { getDb } from '@/db/client';
import { changeAssetVisibility, deleteAsset, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { ensureHomeFamily } from '@/server/onboarding';
import { finishPendingKeeps, keepUpload, rememberKeepForEmail } from '@/server/keepsakes';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { ImageTooLargeError } from '@/storage';
import { clientIp, LIMITS, rateLimit } from '@/server/rateLimit';
import type { VisibilityTier } from '@/domain/types';

/**
 * Keep an uploaded drawing into the signed-in family's keepsake home: the bytes
 * are EXIF-stripped and stored privately, and an asset row is created (kept,
 * FAMILY by default). Requires a session — a guest is told to log in.
 */
export async function keepCreation(formData: FormData): Promise<{ ok: boolean; needsAuth?: boolean; assetId?: string; tooMany?: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (!(await rateLimit(getDb(), { ...LIMITS.homeUploadPerAccount, caller: account.id })).ok) return { ok: false, tooMany: true };

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return { ok: false };
  if (file.size > 25 * 1024 * 1024) return { ok: false }; // 25MB guard

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  const buffer = Buffer.from(await file.arrayBuffer());

  let assetId: string;
  try {
    ({ assetId } = await ingestOriginalAsset(db, viewer, { familyId, kind: 'DRAWING', buffer, keptInHome: true }));
  } catch (e) {
    if (e instanceof ImageTooLargeError) return { ok: false }; // a decompression bomb, or not an image
    throw e;
  }

  revalidatePath('/home');
  return { ok: true, assetId };
}

/**
 * "+ keepsake" on the range: keep the drawing that's ALREADY uploaded (no second upload) in the
 * family's keepsake box — a guest's draft is adopted (their upload claim proves it's theirs), and
 * either way it's kept, FAMILY by default, off the retention clock. Signed-in only.
 */
export async function keepUploadAction(assetId: string): Promise<{ ok: boolean; needsAuth?: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (typeof assetId !== 'string' || !assetId) return { ok: false };
  if (!(await keepUpload(getDb(), account, await getUploadClaims(), assetId))) return { ok: false };
  revalidatePath('/home');
  return { ok: true };
}

/** On the sign-in page: a guest's "+ keepsake" — keep it once THIS email signs in (claim-checked). */
export async function rememberKeepAction(assetId: string, email: string): Promise<{ ok: boolean }> {
  if (!(await rateLimit(getDb(), { ...LIMITS.rememberKeepPerIp, caller: await clientIp() })).ok) return { ok: false };
  if (typeof assetId !== 'string' || typeof email !== 'string') return { ok: false };
  return { ok: await rememberKeepForEmail(getDb(), { assetId, email, uploadClaims: await getUploadClaims() }) };
}

/** Back from signing in: finish any keep they asked for as a guest — in THIS browser only (it must
 * still hold the drawing's upload claim; an email alone never files a picture into a family, 07-B5). */
export async function finishPendingKeepsAction(): Promise<{ ok: boolean; kept: string[] }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, kept: [] };
  const kept = await finishPendingKeeps(getDb(), account, await getUploadClaims());
  if (kept.length) revalidatePath('/home');
  return { ok: true, kept };
}

/** Change a keepsake's visibility (controller-only; re-checked server-side). */
export async function setAssetVisibilityAction(
  assetId: string,
  tier: VisibilityTier,
): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };

  const db = getDb();
  const [asset] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false };

  const viewer = await resolveViewerContext(db, account.id, asset.familyId);
  try {
    await changeAssetVisibility(db, assetId, viewer, tier);
  } catch {
    return { ok: false };
  }
  revalidatePath('/home');
  return { ok: true };
}

/**
 * Delete a keepsake on demand (NN8 + children's-data rules) — controller-only,
 * re-checked server-side. Real + cascading: bytes (confirmed) + DB row + audit.
 */
export async function deleteKeepsakeAction(assetId: string): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };

  const db = getDb();
  const [asset] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false };

  const viewer = await resolveViewerContext(db, account.id, asset.familyId);
  try {
    await deleteAsset(db, assetId, viewer);
  } catch {
    return { ok: false };
  }
  revalidatePath('/home');
  return { ok: true };
}
