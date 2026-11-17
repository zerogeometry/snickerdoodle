'use client';

import { keepUploadAction } from '@/app/actions/keep';
import { uploadGuestImage } from '@/lib/guestUpload';
import { normalizeUpload } from '@/lib/store';
import type { VisibilityTier } from '@/domain/types';

export type KeepPhotoResult = { ok: boolean; needsAuth?: boolean; blocked?: boolean; tooMany?: boolean; filed?: boolean };

/**
 * Keep ONE picked photo in the keepsake box, down the SAME road as every upload: shrunk in the browser, then
 * stored privately + EXIF-stripped + safety-checked (uploadGuestImage), then kept (keepUploadAction — the
 * server re-decides who sees it and whose corner it's in, src/authz). Never throws.
 */
export async function keepPhotoFile(file: File, opts: { visibility?: VisibilityTier; childId?: string | null } = {}): Promise<KeepPhotoResult> {
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const { dataUrl, name } = await normalizeUpload(raw, file.name);
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const up = await uploadGuestImage(blob, name, { termsAccepted: true });
    if (!up.ok || !up.assetId) return { ok: false, blocked: up.blocked, tooMany: up.tooMany };
    const kept = await keepUploadAction(up.assetId, opts);
    return { ok: kept.ok, needsAuth: kept.needsAuth, filed: kept.filed };
  } catch {
    return { ok: false };
  }
}
