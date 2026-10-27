'use server';

import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { applyCutoutMask, cutoutAlphaForAsset, removeBackgroundForAsset } from '@/server/magic';
import { autosaveStudioDoc, cleanGeometry, saveStudio, studioStateForAsset, StudioTextError, type StudioGeometry } from '@/server/studio-doc';
import type { LayerLook, StudioObject } from '@/lib/studio-objects';
import type { StudioLook } from '@/lib/studio-look';
import type { FrameKind } from '@/lib/studio-stickers';
import { getCurrentAccount, getUploadClaims } from '@/server/session';

/**
 * "Remove background" magic edit — self-hosted, gated, budget-capped. Runs
 * in-region (no third party sees the image), stores a cutout DERIVATIVE, and hands
 * back a signed URL + the object id so the editor can preview it and render the
 * final print from it. Works for a signed-in member (via membership) and for a
 * guest (via the upload claim on their own ephemeral draft).
 */
export async function removeBackgroundAction(input: {
  assetId: string;
  /** Keep paper fully enclosed by the drawing (whites of eyes, a snowman) as white. */
  keepEnclosedPaper?: boolean;
}): Promise<{ ok: true; url: string; sourceObjectId: string } | { ok: false; needsAuth?: boolean; reason?: 'budget' | 'nochange' }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, input.assetId, account?.id ?? null, claims);

  try {
    const res = await removeBackgroundForAsset(db, viewer, input.assetId, { keepEnclosedPaper: input.keepEnclosedPaper === true });
    const grant = await getStorageObjectGrant(db, res.objectId, viewer, 600);
    return { ok: true, url: grant.url, sourceObjectId: res.objectId };
  } catch (e) {
    const msg = String(e);
    if (msg.includes('budget')) return { ok: false, reason: 'budget' };
    if (msg.includes('no-clean-background')) return { ok: false, reason: 'nochange' };
    return { ok: false, needsAuth: account === null && viewer.uploadClaim == null };
  }
}

/** The touch-up tool's starting transparency (greyscale PNG data URL), or null = start fully kept. */
export async function cutoutAlphaAction(input: { assetId: string }): Promise<{ ok: true; mask: string | null } | { ok: false }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, claims);
  try {
    const png = await cutoutAlphaForAsset(db, viewer, String(input.assetId));
    return { ok: true, mask: png ? `data:image/png;base64,${png.toString('base64')}` : null };
  } catch {
    return { ok: false };
  }
}

/** Save the parent's touch-up mask (greyscale PNG data URL) as the cutout. */
export async function saveCutoutMaskAction(input: { assetId: string; mask: string }): Promise<{ ok: true; url: string; sourceObjectId: string } | { ok: false }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, claims);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(input.mask ?? ''));
  if (!m) return { ok: false };
  try {
    const res = await applyCutoutMask(db, viewer, String(input.assetId), Buffer.from(m[1]!, 'base64'));
    const grant = await getStorageObjectGrant(db, res.objectId, viewer, 600);
    return { ok: true, url: grant.url, sourceObjectId: res.objectId };
  } catch {
    return { ok: false };
  }
}

/** Reopen the Studio: the saved recipe + the current transparency mask (data URL, or null). */
export async function studioStateAction(input: { assetId: string }): Promise<{ ok: true; geometry: StudioGeometry; objects: StudioObject[]; look: StudioLook | null; drawing: LayerLook | null; frame: FrameKind | null; mask: string | null } | { ok: false }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, claims);
  try {
    const st = await studioStateForAsset(db, viewer, String(input.assetId));
    return { ok: true, geometry: st.geometry, objects: st.objects, look: st.look, drawing: st.drawing, frame: st.frame, mask: st.mask ? `data:image/png;base64,${st.mask.toString('base64')}` : null };
  } catch {
    return { ok: false };
  }
}

/** Save the Studio (mask data URL or null, geometry) → the design products are made from. */
export async function saveStudioAction(input: {
  assetId: string;
  mask: string | null;
  geometry: StudioGeometry;
  objects?: StudioObject[];
  look?: StudioLook | null;
  drawing?: LayerLook | null;
  frame?: FrameKind | null;
  clearCutout?: boolean;
}): Promise<{ ok: true; design: { url: string; sourceObjectId: string } | null; aspect: number } | { ok: false; reason?: 'text' }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, claims);
  let mask: Buffer | null = null;
  if (input.mask) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(input.mask));
    if (!m) return { ok: false };
    mask = Buffer.from(m[1]!, 'base64');
  }
  try {
    const res = await saveStudio(db, viewer, String(input.assetId), { mask, geometry: cleanGeometry(input.geometry), objects: input.objects, look: input.look, drawing: input.drawing, frame: input.frame, clearCutout: input.clearCutout === true });
    if (!res.sourceObjectId) return { ok: true, design: null, aspect: res.aspect };
    const grant = await getStorageObjectGrant(db, res.sourceObjectId, viewer, 600);
    return { ok: true, design: { url: grant.url, sourceObjectId: res.sourceObjectId }, aspect: res.aspect };
  } catch (e) {
    if (e instanceof StudioTextError) return { ok: false, reason: 'text' };
    console.warn('[studio] save failed:', e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

/** Autosave the Studio as the parent works: the recipe, plus the mask when it changed. Nothing is rendered. */
export async function autosaveStudioAction(input: {
  assetId: string;
  mask: string | null;
  geometry: StudioGeometry;
  objects?: StudioObject[];
  look?: StudioLook | null;
  drawing?: LayerLook | null;
  frame?: FrameKind | null;
  clearCutout?: boolean;
}): Promise<{ ok: true } | { ok: false; reason?: 'text' }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, claims);
  let mask: Buffer | null = null;
  if (input.mask) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(input.mask));
    if (!m) return { ok: false };
    mask = Buffer.from(m[1]!, 'base64');
  }
  try {
    await autosaveStudioDoc(db, viewer, String(input.assetId), { mask, geometry: cleanGeometry(input.geometry), objects: input.objects, look: input.look, drawing: input.drawing, frame: input.frame, clearCutout: input.clearCutout === true });
    return { ok: true };
  } catch (e) {
    if (e instanceof StudioTextError) return { ok: false, reason: 'text' };
    return { ok: false };
  }
}
