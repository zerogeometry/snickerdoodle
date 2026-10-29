'use server';

import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { applyCutoutMask, cutoutAlphaForAsset, putBackgroundBack, removeBackgroundForAsset } from '@/server/magic';
import { cleanGeometry, saveStudio, studioStateForAsset, StudioTextError, type StudioGeometry } from '@/server/studio-doc';
import type { StudioObject } from '@/lib/studio-objects';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { clientIp, LIMITS, rateLimit } from '@/server/rateLimit';

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
}): Promise<{ ok: true; url: string; sourceObjectId: string } | { ok: false; needsAuth?: boolean; reason?: 'budget' | 'nochange' | 'too-many' }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  if (!(await rateLimit(db, { ...LIMITS.magicEditsPerIp, caller: await clientIp() })).ok) return { ok: false, reason: 'too-many' };
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

/** "put the background back" on the drawing in progress: its lifted copy is deleted (src/server/magic.ts). */
export async function putBackgroundBackAction(input: { assetId: string; sourceObjectId: string }): Promise<{ ok: boolean }> {
  try {
    const account = await getCurrentAccount();
    const claims = await getUploadClaims();
    const db = getDb();
    const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, claims);
    await putBackgroundBack(db, viewer, String(input.assetId), String(input.sourceObjectId));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** The touch-up tool's starting transparency (greyscale PNG data URL), or null = start fully kept. */
/** A FRESH short-lived link to the drawing's edited design (signed links expire — a page left open, or
 * restored after a while, would show a broken image). Same gate as every other read (src/authz). */
export async function designUrlAction(input: { assetId: string; sourceObjectId: string }): Promise<{ ok: true; url: string } | { ok: false }> {
  try {
    const account = await getCurrentAccount();
    const claims = await getUploadClaims();
    const db = getDb();
    const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, claims);
    const grant = await getStorageObjectGrant(db, String(input.sourceObjectId), viewer, 600);
    return { ok: true, url: grant.url };
  } catch {
    return { ok: false };
  }
}

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
export async function studioStateAction(input: { assetId: string }): Promise<{ ok: true; geometry: StudioGeometry; objects: StudioObject[]; mask: string | null } | { ok: false }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, claims);
  try {
    const st = await studioStateForAsset(db, viewer, String(input.assetId));
    return { ok: true, geometry: st.geometry, objects: st.objects, mask: st.mask ? `data:image/png;base64,${st.mask.toString('base64')}` : null };
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
  clearCutout?: boolean;
}): Promise<{ ok: true; design: { url: string; sourceObjectId: string; px?: { width: number; height: number } } | null; aspect: number } | { ok: false; reason?: 'text' }> {
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
    const res = await saveStudio(db, viewer, String(input.assetId), { mask, geometry: cleanGeometry(input.geometry), objects: input.objects, clearCutout: input.clearCutout === true });
    if (!res.sourceObjectId) return { ok: true, design: null, aspect: res.aspect };
    const grant = await getStorageObjectGrant(db, res.sourceObjectId, viewer, 600);
    return { ok: true, design: { url: grant.url, sourceObjectId: res.sourceObjectId, ...(res.realPx ? { px: res.realPx } : {}) }, aspect: res.aspect };
  } catch (e) {
    if (e instanceof StudioTextError) return { ok: false, reason: 'text' };
    console.warn('[studio] save failed:', e instanceof Error ? e.message : e);
    return { ok: false };
  }
}
