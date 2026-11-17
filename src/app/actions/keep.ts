'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { assets, children } from '@/db/schema';
import { getDb } from '@/db/client';
import { changeAssetVisibility, deleteAsset, familyChildRefs, fileAsset, KeepsakeInUseError, resolveViewerContext } from '@/server/assets';
import { filingChoicesFor } from '@/authz';
import { ingestOriginalAsset } from '@/server/ingest';
import { resolveKeepFamily } from '@/server/onboarding';
import { finishPendingKeeps, keepUpload, rememberKeepForEmail } from '@/server/keepsakes';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { ImageTooLargeError } from '@/storage';
import { clientIp, LIMITS, rateLimit } from '@/server/rateLimit';
import { VISIBILITY_TIERS, type VisibilityTier } from '@/domain/types';

/**
 * Keep an uploaded drawing into the signed-in family's keepsake home: the bytes
 * are EXIF-stripped and stored privately, and an asset row is created (kept,
 * FAMILY by default). Requires a session — a guest is told to log in.
 */
export async function keepCreation(formData: FormData): Promise<{ ok: boolean; needsAuth?: boolean; assetId?: string; tooMany?: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (!(await rateLimit(getDb(), { ...LIMITS.homeUploadPerAccount, caller: account.id })).ok) return { ok: false, tooMany: true };

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return { ok: false };
  if (file.size > 25 * 1024 * 1024) return { ok: false }; // 25MB guard

  const db = getDb();
  const { familyId } = await resolveKeepFamily(db, account.id, account.name); // a CONTRIBUTE relative: the family they joined (04-B3)
  const viewer = await resolveViewerContext(db, account.id, familyId);
  const buffer = Buffer.from(await file.arrayBuffer());

  let assetId: string;
  try {
    ({ assetId } = await ingestOriginalAsset(db, viewer, { familyId, kind: 'DRAWING', buffer, keptInHome: true }, { background: true }));
  } catch (e) {
    if (e instanceof ImageTooLargeError) return { ok: false }; // a decompression bomb, or not an image
    throw e;
  }

  revalidatePath('/home');
  return { ok: true, assetId };
}

/**
 * "+ keepsake" on the range: keep the drawing that's ALREADY uploaded (no second upload) in the
 * family's keepsake box — a guest's draft is adopted (their upload claim proves it's theirs), and
 * either way it's kept, FAMILY by default, off the retention clock. Signed-in only.
 */
export async function keepUploadAction(
  assetId: string,
  /** The keep tab's choices, made BEFORE it goes in the box: who sees it (default family) and whose corner it's
   * filed in (none = "not yet filed"). Both are re-decided server-side (src/authz) — never taken on trust. */
  opts: { visibility?: VisibilityTier; childId?: string | null } = {},
): Promise<{ ok: boolean; needsAuth?: boolean; filed?: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  if (typeof assetId !== 'string' || !assetId) return { ok: false };
  const visibility = typeof opts?.visibility === 'string' && (VISIBILITY_TIERS as readonly string[]).includes(opts.visibility) ? opts.visibility : undefined;
  if (opts?.visibility !== undefined && !visibility) return { ok: false };
  const db = getDb();
  if (!(await keepUpload(db, account, await getUploadClaims(), assetId, { visibility }))) return { ok: false };
  let filed: boolean | undefined;
  if (typeof opts?.childId === 'string' && opts.childId) {
    filed = await fileFor(db, account.id, assetId, opts.childId);
  }
  revalidatePath('/home');
  return { ok: true, ...(filed === undefined ? {} : { filed }) };
}

async function fileFor(db: ReturnType<typeof getDb>, accountId: string, assetId: string, childId: string | null): Promise<boolean> {
  const [asset] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
  if (!asset?.familyId) return false;
  try {
    await fileAsset(db, assetId, await resolveViewerContext(db, accountId, asset.familyId), childId);
    return true;
  } catch {
    return false;
  }
}

/**
 * File a keepsake in a little one's corner, or take it out (childId null) — the person button on a keepsake.
 * Only whoever added it, or (once it's in their child's corner) that child's parent: decided by src/authz
 * planFiling against the family's real children.
 */
export async function fileKeepsakeAction(assetId: string, childId: string | null): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  if (typeof assetId !== 'string' || !assetId) return { ok: false };
  if (childId !== null && (typeof childId !== 'string' || !childId)) return { ok: false };
  const ok = await fileFor(getDb(), account.id, assetId, childId);
  if (ok) revalidatePath('/home');
  return { ok };
}

/**
 * Where the keep tab's photos will go, for its "whose corner" choice: the family a keep lands in (the same one
 * keepUpload picks) and the little ones a new keepsake there may be filed under (src/authz filingChoicesFor —
 * the adder of an unfiled keepsake: every little one in that family). First names only.
 */
export async function keepTargetsAction(): Promise<{ ok: boolean; needsAuth?: boolean; children: { id: string; firstName: string }[] }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true, children: [] };
  const db = getDb();
  const { familyId } = await resolveKeepFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);
  const kids = await familyChildRefs(db, familyId);
  // a keepsake they're about to add: they're its adder, nobody else has a say yet
  const fresh = { id: 'new', familyId, uploaderAccountId: account.id, controllerAccountId: account.id, childSubjectId: null, visibility: 'FAMILY' as const, parentLimit: null, heldForReview: false };
  const allowed = new Set(filingChoicesFor(fresh, viewer, kids)?.childIds ?? []);
  const rows = await db.select({ id: children.id, firstName: children.firstName }).from(children).where(eq(children.familyId, familyId));
  return { ok: true, children: rows.filter((c) => allowed.has(c.id)).sort((a, b) => a.firstName.localeCompare(b.firstName)) };
}

/** On the sign-in page: a guest's "+ keepsake" — keep it once THIS email signs in (claim-checked). */
export async function rememberKeepAction(assetId: string, email: string): Promise<{ ok: boolean }> {
  if (!(await rateLimit(getDb(), { ...LIMITS.rememberKeepPerIp, caller: await clientIp() })).ok) return { ok: false };
  if (typeof assetId !== 'string' || typeof email !== 'string') return { ok: false };
  return { ok: await rememberKeepForEmail(getDb(), { assetId, email, uploadClaims: await getUploadClaims() }) };
}

/** Back from signing in: finish any keep they asked for as a guest — in THIS browser only (it must
 * still hold the drawing's upload claim; an email alone never files a picture into a family, 07-B5). */
export async function finishPendingKeepsAction(): Promise<{ ok: boolean; kept: string[] }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, kept: [] };
  const kept = await finishPendingKeeps(getDb(), account, await getUploadClaims());
  if (kept.length) revalidatePath('/home');
  return { ok: true, kept };
}

/** Change who sees a keepsake (D27: whoever added it chooses; a little one’s parent may only narrow — re-checked server-side). */
export async function setAssetVisibilityAction(
  assetId: string,
  tier: VisibilityTier,
): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };

  const db = getDb();
  const [asset] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false };

  const viewer = await resolveViewerContext(db, account.id, asset.familyId);
  try {
    await changeAssetVisibility(db, assetId, viewer, tier);
  } catch {
    return { ok: false };
  }
  revalidatePath('/home');
  return { ok: true };
}

/**
 * Delete a keepsake on demand (NN8 + children's-data rules) — controller-only,
 * re-checked server-side. Real + cascading: bytes (confirmed) + DB row + audit.
 */
export async function deleteKeepsakeAction(assetId: string): Promise<{ ok: boolean; reason?: 'in-order' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };

  const db = getDb();
  const [asset] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false };

  const viewer = await resolveViewerContext(db, account.id, asset.familyId);
  try {
    await deleteAsset(db, assetId, viewer);
  } catch (e) {
    return e instanceof KeepsakeInUseError ? { ok: false, reason: 'in-order' } : { ok: false };
  }
  revalidatePath('/home');
  return { ok: true };
}
