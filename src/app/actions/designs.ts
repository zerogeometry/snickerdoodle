'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { deleteSavedDesign, saveDesign } from '@/server/savedDesigns';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import type { RawTransform } from '@/server/print/geometry';

/** "+ Keepsake": save this drawing-on-a-product for later (sign-in needed, like checkout). */
export async function saveDesignAction(input: {
  assetId: string;
  variantSku: string;
  transform: RawTransform;
  sourceObjectId?: string;
  back?: string;
}): Promise<{ ok: boolean; needsAuth?: boolean; reason?: 'not-found' | 'not-savable' | 'error' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  try {
    const res = await saveDesign(getDb(), account, await getUploadClaims(), {
      assetId: String(input.assetId),
      variantSku: String(input.variantSku),
      transform: input.transform,
      sourceObjectId: typeof input.sourceObjectId === 'string' ? input.sourceObjectId : null,
      back: typeof input.back === 'string' ? input.back : null,
    });
    if (!res.ok) return { ok: false, reason: res.reason };
    revalidatePath('/home');
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function deleteSavedDesignAction(id: string): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const ok = await deleteSavedDesign(getDb(), account.id, String(id));
  if (ok) revalidatePath('/home');
  return { ok };
}
