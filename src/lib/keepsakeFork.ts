'use client';

import { copyKeepsakeAction, discardCopyAction, keepsakeForStudioAction } from '@/app/actions/keepsakePicker';
import { toast, useUpload, type Upload } from '@/lib/store';

/** A keepsake opened for editing comes as a PNG when it's see-through (keepsakeForStudioAction), else a JPEG. */
export const pictureName = (dataUrl: string) => (dataUrl.startsWith('data:image/png') ? 'drawing.png' : 'drawing.jpg');

type Opened = { trim?: { url: string; sourceObjectId: string }; look?: { url: string; sourceObjectId: string; px?: { width: number; height: number } } };
/**
 * A keepsake opened for editing (keepsakeForStudioAction): its table-trimmed copy, and what the drawing
 * in progress shows and prints as — its saved EDIT when it has one (a Studio design / cut-out), so the
 * Studio puts the cut-out back on the drawing and carries on from it (founder, 25 Nov: a card pack's
 * lifted background was forgotten on reopening); else the trimmed drawing itself. The untouched
 * drawing is still what's edited — the edit is laid over it, never baked in (originals are sacred).
 */
export function keepsakePicture(res: Opened): Pick<NonNullable<Upload>, 'trim' | 'cutout'> {
  return {
    ...(res.trim ? { trim: res.trim } : {}),
    ...(res.look ? { cutout: { ...res.look } } : res.trim ? { cutout: { ...res.trim, trim: true } } : {}),
  };
}

/**
 * Make a keepsake the drawing in progress, so the usual create flow (the range, the basket) follows
 * — from "start from a keepsake" or a keepsake's basket button at home. It's already kept, so the flow
 * shows "kept ♥"; its first edit makes a NEW keepsake (forkPickedKeepsake below). The server gates the
 * read (a member who can see it, short-lived links). False if it couldn't be opened.
 */
export async function openKeepsakeInFlow(assetId: string): Promise<boolean> {
  const res = await keepsakeForStudioAction({ assetId });
  if (!res.ok) return false;
  useUpload.getState().setUpload({
    dataUrl: res.dataUrl,
    name: pictureName(res.dataUrl),
    key: `keepsake-${assetId}`,
    assetId,
    kept: true,
    fromKeepsake: true,
    aspect: res.aspect,
    ...keepsakePicture(res),
  });
  return true;
}

/**
 * A keepsake picked from the box to make real again is edited as a NEW keepsake (founder, 27 Oct:
 * "save the edited variant … as a new keepsake, so we don't overwrite a keepsake previously saved").
 * Before its first edit (remove background on the create page, or opening the Studio) an exact copy
 * is made on the server and becomes the drawing in progress; the keepsake it came from is never
 * touched. Returns the asset to edit (the copy), or null if the copy couldn't be made. A drawing that
 * wasn't picked from the box is returned as it is.
 */
export async function forkPickedKeepsake(): Promise<string | null> {
  const u = useUpload.getState().upload;
  if (!u?.assetId || !u.fromKeepsake) return u?.assetId ?? null;
  const copy = await copyKeepsakeAction({ assetId: u.assetId });
  if (!copy.ok) {
    toast('couldn’t start an edit of that keepsake — try again');
    return null;
  }
  const res = await keepsakeForStudioAction({ assetId: copy.assetId });
  if (!res.ok) {
    void discardCopyAction({ assetId: copy.assetId });
    toast('couldn’t start an edit of that keepsake — try again');
    return null;
  }
  useUpload.getState().setUpload({
    dataUrl: res.dataUrl,
    name: pictureName(res.dataUrl),
    key: `keepsake-${copy.assetId}`,
    assetId: copy.assetId,
    kept: true,
    aspect: res.aspect,
    copyOf: u.assetId,
    ...keepsakePicture(res),
  });
  return copy.assetId;
}

/**
 * The Studio was left without saving an edit of a copy made for it: tidy the copy away and put the
 * keepsake it came from back as the drawing in progress.
 */
export async function unforkUnsavedCopy(): Promise<void> {
  const u = useUpload.getState().upload;
  if (!u?.assetId || !u.copyOf) return;
  const original = u.copyOf;
  await discardCopyAction({ assetId: u.assetId });
  const res = await keepsakeForStudioAction({ assetId: original });
  if (!res.ok) return;
  useUpload.getState().setUpload({
    dataUrl: res.dataUrl,
    name: pictureName(res.dataUrl),
    key: `keepsake-${original}`,
    assetId: original,
    kept: true,
    fromKeepsake: true,
    aspect: res.aspect,
    ...keepsakePicture(res),
  });
}
