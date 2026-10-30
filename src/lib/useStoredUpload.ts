'use client';

import { useEffect } from 'react';
import { uploadGuestImage } from '@/lib/guestUpload';
import { TOO_MANY_COPY } from '@/lib/rateLimitCopy';
import { applyIngested, toast, useUpload, useUploadHydrated } from '@/lib/store';

/** One store per drawing, however many builders ask at once (keyed by the upload's key). */
const inFlight = new Map<string, Promise<void>>();

/**
 * Make sure the drawing in progress is a stored (screened) asset. The range does this as it opens; a
 * builder opened straight by its address (typed, bookmarked, refreshed) used to skip it, so a guest's
 * drawing had no asset yet and the picker didn't offer "this drawing" at all (sweep 01-B4).
 */
export function useStoredUpload(): void {
  const hydrated = useUploadHydrated();
  const upload = useUpload((s) => s.upload);
  const key = upload && !upload.assetId ? upload.key ?? upload.dataUrl.slice(-64) : null;
  useEffect(() => {
    if (!hydrated || !key || inFlight.has(key)) return;
    const u = useUpload.getState().upload;
    if (!u || u.assetId) return;
    const run = (async () => {
      try {
        const blob = await fetch(u.dataUrl).then((r) => r.blob());
        const res = await uploadGuestImage(blob, u.name || 'drawing.png', { termsAccepted: true });
        // only onto the SAME drawing — a new upload meanwhile is its own
        if (res.ok && res.assetId) {
          if (useUpload.getState().upload?.dataUrl === u.dataUrl) applyIngested(res.assetId, res.trimmed);
        } else toast(res.blocked ? 'we couldn’t use that image — try another' : res.tooMany ? TOO_MANY_COPY : 'hmm, that drawing didn’t upload — try again');
      } catch {
        toast('that didn’t upload — try again, or a smaller image');
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, run);
  }, [hydrated, key]);
}
