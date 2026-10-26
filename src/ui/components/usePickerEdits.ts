'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepUploadAction } from '@/app/actions/keep';
import { keepsakeForStudioAction } from '@/app/actions/keepsakePicker';
import { removeBackgroundAction } from '@/app/actions/magic';
import { uploadGuestImage } from '@/lib/guestUpload';
import { normalizeUpload, toast, useUpload, type Upload } from '@/lib/store';
import { toSessionUpload } from '@/lib/uploadSession';

/**
 * The calendar's and the card pack's drawing picker, made a little workshop (founder, 26 Oct):
 *  - "upload to keepsake": one or more photos from the computer / the phone's gallery, each stored,
 *    screened and kept in the family's keepsake box like any other;
 *  - per drawing, "remove background" (and back again) and "edit in studio" — so each card / page
 *    prints exactly as edited.
 *
 * Edits made here are this builder's own (a drawing's design for these cards / pages); the Studio is
 * reached by briefly opening the chosen keepsake as "the drawing" (setting aside the one in progress,
 * put back on return) — every Studio tool works unchanged.
 */
export type DrawingEdit = { url: string; sourceObjectId: string };
type Drawingish = { assetId: string; imageUrl: string | null; sourceObjectId?: string };

const STASH_KEY = 'sd_upload_stash'; // the drawing in progress, set aside while a keepsake is in the Studio
const EDITS_KEY = 'sd_picker_edits'; // + the builder: this tab's per-drawing edits, separate for the calendar and the cards
const DETOUR_KEY = 'sd_studio_detour'; // { assetId, returnTo } while a keepsake is in the Studio

/** Where the Studio goes back to when it was opened from a picker (null = the usual collection). */
export function studioReturnTo(): string | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DETOUR_KEY) ?? 'null') as { returnTo?: string } | null;
    return d?.returnTo ?? null;
  } catch {
    return null;
  }
}

export function usePickerEdits(opts: { returnTo: string; onUploaded: () => void }) {
  const editsKey = `${EDITS_KEY}:${opts.returnTo.split('?')[0]}`;
  const router = useRouter();
  // kept for the tab, so a trip to the Studio (or a reload) doesn't undo the edits on other pages / cards
  // (read after mount — the server render and the first client render agree)
  const [edits, setEdits] = useState<Record<string, DrawingEdit>>({});
  const editsRead = useRef(false);
  useEffect(() => {
    if (!editsRead.current) {
      editsRead.current = true;
      try {
        const saved = JSON.parse(sessionStorage.getItem(editsKey) ?? '{}') as Record<string, DrawingEdit>;
        if (saved && Object.keys(saved).length) {
          setEdits((e) => ({ ...saved, ...e }));
          return;
        }
      } catch {
        /* no storage */
      }
    }
    try {
      sessionStorage.setItem(editsKey, JSON.stringify(edits));
    } catch {
      /* no storage */
    }
  }, [edits, editsKey]);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null);
  const restored = useRef(false);

  // Back from the Studio: the keepsake's saved design becomes its edit here, and the drawing that was
  // in progress is put back where it was.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let detour: { assetId: string } | null = null;
    try {
      detour = JSON.parse(sessionStorage.getItem(DETOUR_KEY) ?? 'null');
    } catch {
      /* no storage */
    }
    if (!detour) return;
    const u = useUpload.getState().upload;
    if (u?.assetId === detour.assetId && u.cutout && !u.cutout.trim) {
      const design = { url: u.cutout.url, sourceObjectId: u.cutout.sourceObjectId };
      setEdits((e) => ({ ...e, [detour!.assetId]: design }));
    }
    try {
      // (only when one WAS set aside — editing the drawing in progress itself sets nothing aside)
      const stash = sessionStorage.getItem(STASH_KEY);
      if (stash !== null) {
        const prev = (JSON.parse(stash) as { upload: Upload | null }).upload ?? null;
        useUpload.getState().setUpload(prev);
        sessionStorage.removeItem(STASH_KEY);
      }
      sessionStorage.removeItem(DETOUR_KEY);
    } catch {
      /* no storage */
    }
  }, []);

  /** The drawings as they'll print here: an edit made in this builder replaces the picture + source. */
  const apply = useCallback(<D extends Drawingish>(list: D[]): D[] => list.map((d) => (edits[d.assetId] ? { ...d, imageUrl: edits[d.assetId]!.url, sourceObjectId: edits[d.assetId]!.sourceObjectId } : d)), [edits]);

  const toggleBackground = async (d: Drawingish) => {
    if (busy[d.assetId]) return;
    if (edits[d.assetId]) {
      setEdits(({ [d.assetId]: _gone, ...rest }) => rest);
      toast('background back — just as it was');
      return;
    }
    setBusy((b) => ({ ...b, [d.assetId]: 'lifting…' }));
    try {
      const res = await removeBackgroundAction({ assetId: d.assetId, keepEnclosedPaper: true });
      if (res.ok) {
        setEdits((e) => ({ ...e, [d.assetId]: { url: res.url, sourceObjectId: res.sourceObjectId } }));
        toast('background removed ✨');
      } else toast(res.reason === 'nochange' ? 'no plain paper on this one — try the studio' : 'couldn’t do that — try again');
    } finally {
      setBusy(({ [d.assetId]: _done, ...rest }) => rest);
    }
  };

  const editInStudio = async (d: Drawingish) => {
    if (busy[d.assetId]) return;
    const current = useUpload.getState().upload;
    // the drawing in progress IS this one: the Studio as usual, back here afterwards
    if (current?.assetId === d.assetId) {
      try {
        sessionStorage.setItem(DETOUR_KEY, JSON.stringify({ assetId: d.assetId, returnTo: opts.returnTo }));
      } catch {
        /* no storage */
      }
      router.push('/studio');
      return;
    }
    setBusy((b) => ({ ...b, [d.assetId]: 'opening…' }));
    try {
      const res = await keepsakeForStudioAction({ assetId: d.assetId });
      if (!res.ok) return void toast('couldn’t open that one — try again');
      try {
        sessionStorage.setItem(STASH_KEY, JSON.stringify({ upload: current ? toSessionUpload(current) : null }));
        sessionStorage.setItem(DETOUR_KEY, JSON.stringify({ assetId: d.assetId, returnTo: opts.returnTo }));
      } catch {
        return void toast('couldn’t open the studio from here — try from your collection');
      }
      const trim = res.trim;
      useUpload.getState().setUpload({
        dataUrl: res.dataUrl,
        name: 'drawing.jpg',
        key: `keepsake-${d.assetId}`,
        assetId: d.assetId,
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

  return { edits, busy, uploading, apply, toggleBackground, editInStudio, uploadToKeepsake };
}
