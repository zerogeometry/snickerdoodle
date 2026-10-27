'use client';

import { copyKeepsakeAction, discardCopyAction, keepsakeForStudioAction } from '@/app/actions/keepsakePicker';
import { toast, useUpload } from '@/lib/store';

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
  const trim = res.trim;
  useUpload.getState().setUpload({
    dataUrl: res.dataUrl,
    name: 'drawing.jpg',
    key: `keepsake-${copy.assetId}`,
    assetId: copy.assetId,
    kept: true,
    aspect: res.aspect,
    copyOf: u.assetId,
    ...(trim ? { trim, cutout: { ...trim, trim: true } } : {}),
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
  const trim = res.trim;
  useUpload.getState().setUpload({
    dataUrl: res.dataUrl,
    name: 'drawing.jpg',
    key: `keepsake-${original}`,
    assetId: original,
    kept: true,
    fromKeepsake: true,
    aspect: res.aspect,
    ...(trim ? { trim, cutout: { ...trim, trim: true } } : {}),
  });
}
