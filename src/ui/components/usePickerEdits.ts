'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepUploadAction } from '@/app/actions/keep';
import { copyKeepsakeAction, discardCopyAction, keepsakeForStudioAction } from '@/app/actions/keepsakePicker';
import { putBackgroundBackAction, removeBackgroundAction } from '@/app/actions/magic';
import { uploadGuestImage } from '@/lib/guestUpload';
import { normalizeUpload, toast, useUpload, type Upload } from '@/lib/store';
import { toSessionUpload } from '@/lib/uploadSession';

/**
 * The calendar's and the card pack's drawing picker, made a little workshop (founder, 26 Oct):
 *  - "upload to keepsake": one or more photos from the computer / the phone's gallery, each stored,
 *    screened and kept in the family's keepsake box like any other;
 *  - per drawing, "remove background" and "edit in studio" — so each card / page prints exactly as edited.
 *
 * Editing a KEEPSAKE here makes a NEW keepsake (founder, 27 Oct: "save the edited variant … as a new
 * keepsake, so we don't overwrite a keepsake previously saved"): the copy is made on the server, the
 * edit happens on the copy, and the copy is chosen. The keepsake it came from is never touched, so
 * anything already in a basket or an order still prints exactly what was chosen. (The drawing in
 * progress that isn't a keepsake yet has nothing saved to overwrite — it's edited as itself.)
 * The Studio is reached by briefly opening the copy as "the drawing" (setting aside the one in
 * progress, put back on return) — every Studio tool works unchanged; a copy left unsaved is tidied away.
 */
type Drawingish = { assetId: string; imageUrl: string | null; sourceObjectId?: string; px?: { width: number; height: number } };
/** the drawing in progress, set aside without its picture */
type Stashed = Omit<NonNullable<Upload>, 'dataUrl'>;

const STASH_KEY = 'sd_upload_stash'; // the drawing in progress, set aside while a keepsake is in the Studio
const DETOUR_KEY = 'sd_studio_detour'; // { assetId, returnTo, sheet } while a keepsake is in the Studio
/** the picker as it was when the Studio was opened from it — which card / page it was filling */
export type PickerSheet = { slot: number; advance: boolean };

/** Where the Studio goes back to when it was opened from a picker for THIS drawing (null = the usual
 * collection — a note left by a detour abandoned some other way never hijacks a later Studio visit). */
export function studioReturnTo(assetId?: string | null): string | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DETOUR_KEY) ?? 'null') as { returnTo?: string; assetId?: string } | null;
    if (!d?.returnTo || (assetId && d.assetId && d.assetId !== assetId)) return null;
    return d.returnTo;
  } catch {
    return null;
  }
}

/**
 * Open the Studio from a PRODUCT page and come back to it when done (sweep 01-B3: the dark tee's
 * "lift it off the paper in the studio" used to land on the create page, the tee lost). The same
 * note the pickers leave, with no sheet and nothing set aside. The product page tidies it away on
 * arrival (forgetStudioReturn), so it never steers a later Studio visit.
 */
export function noteStudioReturn(assetId: string | null | undefined, returnTo: string): void {
  try {
    sessionStorage.setItem(DETOUR_KEY, JSON.stringify({ assetId: assetId ?? null, returnTo }));
  } catch {
    /* no storage — the Studio goes back to the collection as before */
  }
}
/** Arrived on a product page: drop a return note that pointed at a product page (it has done its job). */
export function forgetStudioReturn(): void {
  try {
    const d = JSON.parse(sessionStorage.getItem(DETOUR_KEY) ?? 'null') as { returnTo?: string } | null;
    if (d?.returnTo?.startsWith('/customize/')) sessionStorage.removeItem(DETOUR_KEY);
  } catch {
    /* fine */
  }
}

/**
 * Does this visit to a builder CARRY ON the last one? Only on the way back from the Studio (its return
 * address carries ?resume=1). Any other arrival starts fresh — the drawing in progress, nothing from a
 * pack or calendar bailed on earlier (founder, 26 Oct: "I don't want it to be pre-populated with things
 * from a session I bailed on earlier").
 */
export function isResumeVisit(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('resume') === '1';
  } catch {
    return false;
  }
}
/** Drop ?resume=1 once used, so a reload / a later "back" to this entry starts fresh. Call it from an
 * effect declared AFTER usePickerEdits — its "back from the Studio" check reads the same flag (founder,
 * 29 Oct: the bundle builder cleared it first, so the Studio's edit never came back). */
export function forgetResumeVisit(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('resume')) return;
    url.searchParams.delete('resume');
    window.history.replaceState(window.history.state, '', url.pathname + (url.search ? url.search : '') + url.hash);
  } catch {
    /* fine */
  }
}

export function usePickerEdits(opts: {
  returnTo: string;
  onUploaded: () => void;
  /** the open picker (put back on return) */
  sheet?: PickerSheet | null;
  /** a new keepsake was made from an edit — choose it */
  onCopied?: (assetId: string) => void;
  /** PER-PIECE edits (the family bundle — founder, 29 Oct): the drawing in progress is kept first and its
   * edits made on a COPY, so editing one piece never changes the others showing the same drawing. A guest
   * (nothing can be kept, so no copy) is ASKED first — edit every piece, or log in to edit just this one
   * (sweep 01-B2: the edit used to change every piece without a word). */
  forkLoose?: boolean;
}) {
  const router = useRouter();
  // (the per-builder edits this replaced lived in the tab: clear what an earlier version left behind)
  useEffect(() => {
    try {
      for (const k of Object.keys(sessionStorage)) if (k.startsWith('sd_picker_edits')) sessionStorage.removeItem(k);
    } catch {
      /* no storage */
    }
  }, []);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null);
  const restored = useRef(false);
  // forkLoose, and no copy could be made (a guest): the edit waiting for "edit every piece" — and the
  // drawing the shopper already said yes for (asked once per visit)
  const [shared, setShared] = useState<{ assetId: string; action: 'background' | 'studio'; d: Drawingish } | null>(null);
  const everyPiece = useRef<string | null>(null);
  // Back from the Studio (founder, 26 Oct: "clicked done … out of the picker, with no card picked"):
  // the picker reopens on the card / page it was filling, with the drawing just edited chosen.
  const [resume, setResume] = useState<{ assetId: string; sheet: PickerSheet } | null>(null);
  const clearResume = useCallback(() => setResume(null), []);

  // Back from the Studio: the new keepsake is chosen (or, left unsaved, tidied away and the one it came
  // from chosen again), and the drawing that was in progress is put back where it was.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let detour: { assetId: string; copyOf?: string | null; sheet?: PickerSheet | null } | null = null;
    try {
      detour = JSON.parse(sessionStorage.getItem(DETOUR_KEY) ?? 'null');
    } catch {
      /* no storage */
    }
    if (!detour) return;
    const u = useUpload.getState().upload;
    const saved = u?.assetId === detour.assetId && !!u.cutout && !u.cutout.trim;
    // a copy made for the Studio and then never saved: nothing new to keep
    if (detour.copyOf && !saved) void discardCopyAction({ assetId: detour.assetId }).then(() => opts.onUploaded());
    const chosen = detour.copyOf && !saved ? detour.copyOf : detour.assetId;
    // (a detour abandoned some other way: just put the drawing in progress back, below)
    // (a builder must tidy ?resume=1 away only AFTER this has run — see forgetResumeVisit)
    if (isResumeVisit() && detour.sheet) setResume({ assetId: chosen, sheet: detour.sheet });
    try {
      // (only when one WAS set aside — editing the drawing in progress itself sets nothing aside)
      const stash = sessionStorage.getItem(STASH_KEY);
      if (stash !== null) {
        sessionStorage.removeItem(STASH_KEY);
        const prev = (JSON.parse(stash) as { upload: Stashed | null }).upload ?? null;
        // the picture itself wasn't set aside (two photos overflow a tab's storage): fetch it again
        if (prev?.assetId) {
          void keepsakeForStudioAction({ assetId: prev.assetId }).then((r) => {
            useUpload.getState().setUpload(r.ok ? { ...prev, dataUrl: r.dataUrl } : null);
          });
        } else useUpload.getState().setUpload(null);
      }
      sessionStorage.removeItem(DETOUR_KEY);
    } catch {
      /* no storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  /** The drawings as they'll print here (edits are real keepsakes now — nothing to lay over them). */
  const apply = useCallback(<D extends Drawingish>(list: D[]): D[] => list, []);

  /** Is this the drawing in progress that isn't a keepsake yet (edited as itself, not copied)? */
  const isLooseDrawing = (d: Drawingish) => {
    const u = useUpload.getState().upload;
    return !!u && u.assetId === d.assetId && !u.kept;
  };
  /** forkLoose: keep the drawing in progress (signed in) so its edit becomes a copy. True when it now is one. */
  const keptForEdit = async (d: Drawingish): Promise<boolean> => {
    if (!opts.forkLoose || !isLooseDrawing(d)) return false;
    const r = await keepUploadAction(d.assetId).catch(() => ({ ok: false }));
    if (!r.ok) return false;
    useUpload.setState((s) => (s.upload?.assetId === d.assetId ? { upload: { ...s.upload, kept: true } } : {}));
    opts.onUploaded();
    return true;
  };
  /** forkLoose: no copy could be made (a guest), so this edit would change EVERY piece showing the
   * drawing — ask first (unless they've already said yes for it). True = asked; don't edit yet. */
  const mustAskFirst = async (d: Drawingish, action: 'background' | 'studio'): Promise<boolean> => {
    if (!opts.forkLoose || !isLooseDrawing(d)) return false;
    if (await keptForEdit(d)) return false;
    if (everyPiece.current === d.assetId) return false;
    setShared({ assetId: d.assetId, action, d });
    return true;
  };
  /** The drawing in progress (not a keepsake yet) with its background lifted — "put it back" undoes it. */
  const hasLiftedBackground = (d: Drawingish) => {
    const u = useUpload.getState().upload;
    return isLooseDrawing(d) && !!u?.cutout && !u.cutout.trim;
  };

  const toggleBackground = async (d: Drawingish) => {
    if (busy[d.assetId]) return;
    setBusy((b) => ({ ...b, [d.assetId]: 'lifting…' }));
    try {
      if (await mustAskFirst(d, 'background')) return;
      if (isLooseDrawing(d)) {
        // the drawing in progress: its own cutout, and back again
        if (hasLiftedBackground(d)) {
          // the lifted copy is deleted, not just hidden — it can't come back in a later edit or copy
          const lifted = useUpload.getState().upload?.cutout?.sourceObjectId;
          if (lifted) void putBackgroundBackAction({ assetId: d.assetId, sourceObjectId: lifted });
          useUpload.getState().setCutout(null);
          return void toast('background back — just as it was');
        }
        const res = await removeBackgroundAction({ assetId: d.assetId, keepEnclosedPaper: true });
        if (res.ok) {
          useUpload.getState().setCutout({ url: res.url, sourceObjectId: res.sourceObjectId });
          toast('background removed ✨');
        } else toast(res.reason === 'nochange' ? 'no plain paper on this one — try the studio' : 'couldn’t do that — try again');
        return;
      }
      // a keepsake: a NEW keepsake with the background lifted, chosen here
      const res = await copyKeepsakeAction({ assetId: d.assetId, removeBackground: true });
      if (res.ok) {
        toast('saved as a new keepsake — background removed ✨');
        opts.onUploaded();
        opts.onCopied?.(res.assetId);
      } else toast(res.reason === 'nochange' ? 'no plain paper on this one — try the studio' : 'couldn’t do that — try again');
    } finally {
      setBusy(({ [d.assetId]: _done, ...rest }) => rest);
    }
  };

  const editInStudio = async (d: Drawingish) => {
    if (busy[d.assetId]) return;
    if (await mustAskFirst(d, 'studio')) return;
    const current = useUpload.getState().upload;
    // the drawing in progress, not a keepsake yet: the Studio as usual, back here afterwards
    if (isLooseDrawing(d)) {
      try {
        sessionStorage.setItem(DETOUR_KEY, JSON.stringify({ assetId: d.assetId, returnTo: opts.returnTo, sheet: opts.sheet ?? null }));
      } catch {
        /* no storage */
      }
      router.push('/studio');
      return;
    }
    setBusy((b) => ({ ...b, [d.assetId]: 'opening…' }));
    try {
      // a keepsake: the Studio edits a NEW keepsake (an exact copy, made now)
      const copy = await copyKeepsakeAction({ assetId: d.assetId });
      if (!copy.ok) return void toast('couldn’t open that one — try again');
      const res = await keepsakeForStudioAction({ assetId: copy.assetId });
      if (!res.ok) {
        void discardCopyAction({ assetId: copy.assetId });
        return void toast('couldn’t open that one — try again');
      }
      try {
        // set aside WITHOUT its picture — the tab can't hold two photos; it's fetched again on return
        const { dataUrl: _picture, ...rest } = current ? (toSessionUpload(current) ?? { dataUrl: '' }) : { dataUrl: '' };
        sessionStorage.setItem(STASH_KEY, JSON.stringify({ upload: current ? rest : null }));
        sessionStorage.setItem(DETOUR_KEY, JSON.stringify({ assetId: copy.assetId, copyOf: d.assetId, returnTo: opts.returnTo, sheet: opts.sheet ?? null }));
      } catch {
        void discardCopyAction({ assetId: copy.assetId });
        return void toast('couldn’t open the studio from here — try from your collection');
      }
      const trim = res.trim;
      useUpload.getState().setUpload({
        dataUrl: res.dataUrl,
        name: 'drawing.jpg',
        key: `keepsake-${copy.assetId}`,
        assetId: copy.assetId,
        kept: true,
        aspect: res.aspect,
        ...(trim ? { trim, cutout: { ...trim, trim: true } } : {}),
      });
      router.push('/studio');
    } finally {
      setBusy(({ [d.assetId]: _done, ...rest }) => rest);
    }
  };

  /** "upload to keepsake": each photo stored + screened + kept (an account keeps them — the caller only
   * offers this when signed in). */
  const uploadToKeepsake = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length || uploading) return;
    setUploading({ done: 0, of: list.length });
    let kept = 0;
    for (const f of list) {
      try {
        const raw = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        const { dataUrl, name } = await normalizeUpload(raw, f.name);
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const up = await uploadGuestImage(blob, name, { termsAccepted: true });
        if (up.ok && up.assetId && (await keepUploadAction(up.assetId)).ok) kept++;
        else if (up.blocked) toast('we couldn’t use one of those images');
      } catch {
        /* counted below */
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    toast(kept === list.length ? (kept === 1 ? 'added to your keepsake box ♥' : `${kept} drawings added to your keepsake box ♥`) : `${kept} of ${list.length} added — try the others again`);
    opts.onUploaded();
  };

  /** "edit every piece": the shopper said yes — the waiting edit goes ahead on the drawing itself. */
  const editEveryPiece = () => {
    const s = shared;
    if (!s) return;
    everyPiece.current = s.assetId;
    setShared(null);
    void (s.action === 'studio' ? editInStudio(s.d) : toggleBackground(s.d));
  };
  const cancelShared = () => setShared(null);

  return { busy, uploading, apply, hasLiftedBackground, toggleBackground, editInStudio, uploadToKeepsake, resume, clearResume, shared, editEveryPiece, cancelShared };
}
