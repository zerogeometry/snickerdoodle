'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { assets } from '@/db/schema';
import { getDb } from '@/db/client';
import { changeAssetVisibility, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import type { VisibilityTier } from '@/domain/types';

/**
 * Keep an uploaded drawing into the signed-in family's keepsake home: the bytes
 * are EXIF-stripped and stored privately, and an asset row is created (kept,
 * FAMILY by default). Requires a session — a guest is told to log in.
 */
export async function keepCreation(formData: FormData): Promise<{ ok: boolean; needsAuth?: boolean; assetId?: string }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return { ok: false };
  if (file.size > 25 * 1024 * 1024) return { ok: false }; // 25MB guard

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { assetId } = await ingestOriginalAsset(db, viewer, {
    familyId,
    kind: 'DRAWING',
    buffer,
    keptInHome: true,
  });

  revalidatePath('/home');
  return { ok: true, assetId };
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
