'use client';

import { useRouter } from 'next/navigation';
import { create } from 'zustand';
import { keepUploadAction } from '@/app/actions/keep';
import { uploadGuestImage } from '@/lib/guestUpload';
import { savePendingKeep } from '@/lib/pending-keep';
import { TOO_MANY_COPY } from '@/lib/rateLimitCopy';
import { applyIngested, toast, useUpload } from '@/lib/store';

/**
 * The drawing on screen, stored + screened ONCE: every caller (the range's background warm-up, "+ keepsake",
 * the create page's little heart) shares the same in-flight upload — never a second copy of the bytes.
 */
let ingesting: { dataUrl: string; run: Promise<string | null> } | null = null;

export function ensureUploadAsset(): Promise<string | null> {
  const upload = useUpload.getState().upload;
  if (!upload) return Promise.resolve(null);
  if (upload.assetId) return Promise.resolve(upload.assetId);
  if (ingesting && ingesting.dataUrl === upload.dataUrl) return ingesting.run; // already on its way
  const run = (async (): Promise<string | null> => {
    try {
      const blob = await fetch(upload.dataUrl).then((r) => r.blob());
      const res = await uploadGuestImage(blob, upload.name || 'drawing.png', { termsAccepted: true });
      if (res.ok && res.assetId) {
        applyIngested(res.assetId, res.trimmed);
        return res.assetId;
      }
      toast(res.blocked ? 'we couldn’t use that image — try another' : res.tooMany ? TOO_MANY_COPY : 'hmm, that didn’t work — try again');
      return null;
    } catch {
      // e.g. a too-large upload or a network blip — surface it, never throw silently
      toast('that didn’t upload — try again, or a smaller image');
      return null;
    }
  })();
  const mine = { dataUrl: upload.dataUrl, run };
  ingesting = mine;
  void run.finally(() => {
    if (ingesting === mine) ingesting = null;
  });
  return run;
}

/** The drawing's first upload is still on its way (so a tap can say "getting it ready…"). */
export function isIngesting(): boolean {
  return ingesting !== null;
}

/** One keep at a time, whichever button started it (both show "keeping…"). */
const useKeeping = create<{ busy: boolean }>(() => ({ busy: false }));

/**
 * "+ keepsake": keep THE drawing on screen in the family's keepsake box (signed in; no second upload). A guest
 * signs in first and the keep finishes when they're back (the drawing comes back on screen). Shared by the
 * range's "+ keepsake" button and the create page's quick heart, so both say and do exactly the same.
 */
export function useKeepDrawing() {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  const keeping = useKeeping((s) => s.busy);
  const kept = !!upload?.assetId && upload.kept === true;

  const keep = async () => {
    if (useKeeping.getState().busy) return;
    if (!useUpload.getState().upload) {
      toast('upload a drawing first');
      router.push('/start-creating');
      return;
    }
    useKeeping.setState({ busy: true });
    try {
      const id = await ensureUploadAsset();
      if (!id) return;
      const res = await keepUploadAction(id);
      if (res.needsAuth) {
        // keeping needs an account (the parent controls it): sign in, then we finish the keep —
        // the drawing comes back on screen, and the server keeps it whichever device they sign in on
        const u = useUpload.getState().upload;
        if (u) await savePendingKeep({ ...u, assetId: id });
        toast('a quick sign-in and it’s kept');
        router.push(`/login?next=${encodeURIComponent('/start-creating?resume=keep')}&keep=${encodeURIComponent(id)}`);
        return;
      }
      if (res.ok) {
        // remembered with the drawing, so leaving the create flow doesn't let it go
        const u = useUpload.getState().upload;
        if (u?.assetId === id) useUpload.getState().setUpload({ ...u, kept: true });
      }
      toast(res.ok ? 'kept in your keepsake box ♥' : 'couldn’t keep that one — try again');
    } finally {
      useKeeping.setState({ busy: false });
    }
  };

  return { keep, keeping, kept };
}
