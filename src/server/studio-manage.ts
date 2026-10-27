import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { accounts, assets, memberships, storageObjects } from '@/db/schema';
import { derivativeKey, getObjectBytes, originalKey, putObject } from '@/storage';
import { AuthzError, canDiscardDraft, canSetAssetVisibility, type ViewerContext } from '@/authz';
import type { VisibilityTier } from '@/domain/types';
import type { DbHandle } from './db';
import { deleteAsset, eraseAsset, getViewableAssetOrThrow } from './assets';

/** What the Studio's "this stays yours" pill shows about the creation being edited. */
export interface StudioKeepsakeInfo {
  /** A guest-style draft: only its uploader (claim holder) can see it, until it's kept. */
  draft: boolean;
  kept: boolean;
  visibility: VisibilityTier;
  /** The viewer is the controlling parent: they choose who sees it and can delete it. */
  canManage: boolean;
  /** The family's OTHER active members (initial + circle) — the real "who's included". */
  people: { initial: string; circle: 'FAMILY' | 'EXTENDED' }[];
}

/** Read through the gate; who-can-see is resolved here, never taken from the browser. */
export async function studioKeepsakeInfo(db: DbHandle, viewer: ViewerContext, assetId: string): Promise<StudioKeepsakeInfo> {
  const ref = await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const [row] = await db.select({ kept: assets.keptInHome }).from(assets).where(eq(assets.id, assetId));
  const draft = ref.ephemeralClaimId != null;
  const canManage = !draft && canSetAssetVisibility(ref, viewer);
  let people: StudioKeepsakeInfo['people'] = [];
  // only the controller is shown who else is in the family (they're the one choosing)
  if (canManage && ref.familyId) {
    const rows = await db
      .select({ accountId: memberships.accountId, circle: memberships.circle, name: accounts.displayName, email: accounts.email })
      .from(memberships)
      .innerJoin(accounts, eq(memberships.accountId, accounts.id))
      .where(and(eq(memberships.familyId, ref.familyId), eq(memberships.status, 'ACTIVE')));
    people = rows
      .filter((r) => r.accountId !== viewer.accountId)
      .map((r) => ({ initial: (r.name ?? r.email.split('@')[0] ?? 'M').charAt(0).toUpperCase(), circle: r.circle }));
  }
  return { draft, kept: row?.kept === true, visibility: ref.visibility, canManage, people };
}

/**
 * Delete the creation open in the Studio, and its source, for good (NN8): a kept keepsake by its
 * controlling parent (deleteAsset), a draft by the person holding its upload claim. Either way
 * the same cascading erase runs — every stored version's bytes (confirmed), the row, the ledger.
 */
export async function deleteStudioCreation(db: DbHandle, viewer: ViewerContext, assetId: string): Promise<void> {
  const ref = await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate (also refuses BLOCKED content)
  if (ref.ephemeralClaimId == null) return deleteAsset(db, assetId, viewer);
  if (!canDiscardDraft(ref, viewer)) throw new AuthzError({ allowed: false, reason: 'not found' });
  await eraseAsset(db, { id: ref.id, familyId: ref.familyId }, { accountId: viewer.accountId, actorType: viewer.accountId ? 'MEMBER' : 'GUEST' }, { via: 'studio' });
}

/**
 * DUPLICATE (Studio spec §17 "branch a new edit"): a new keepsake with this one's recipe, made
 * from the same untouched original. The original's BYTES are copied, not shared — the storage
 * model gives every keepsake its own original so deleting one is always real and complete, and
 * never pulls the picture out from under the other. Only the controlling parent of a kept
 * keepsake may (never a draft, never one held for review); the copy has the same child, circle
 * and keep status. It isn't rendered or re-screened here: "done" in the Studio does that.
 * A table-trimmed upload's trimmed copy (the drawing every edit works from) is copied too.
 */
export async function duplicateCreation(db: DbHandle, viewer: ViewerContext, assetId: string): Promise<{ assetId: string; trimmedObjectId: string | null }> {
  const ref = await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  if (ref.ephemeralClaimId != null || !canSetAssetVisibility(ref, viewer) || ref.heldForReview) throw new AuthzError({ allowed: false, reason: 'not found' });
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!row || row.moderationStatus !== 'CLEAR') throw new AuthzError({ allowed: false, reason: 'not found' });
  const objects = await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId));
  const original = objects.find((o) => o.objectClass === 'ORIGINAL');
  if (!original) throw new Error('no original to copy');

  const id = randomUUID();
  // only the upload's own (clean) verdict travels — the copy's design is screened when it's made
  const detail = row.moderationDetail as { original?: { labels?: string[] } } | null;
  await db.insert(assets).values({
    id,
    familyId: row.familyId,
    kind: row.kind,
    uploaderAccountId: viewer.accountId,
    childSubjectId: row.childSubjectId,
    controllerAccountId: row.controllerAccountId,
    termsAcceptedAt: row.termsAcceptedAt,
    termsVersion: row.termsVersion,
    isBrandSafeFixture: row.isBrandSafeFixture,
    visibility: row.visibility,
    moderationStatus: 'CLEAR',
    moderatedAt: row.moderatedAt,
    moderationDetail: detail?.original ? { labels: detail.original.labels ?? [], original: detail.original } : null,
    keptInHome: row.keptInHome,
    purgeAfter: row.purgeAfter,
    studioDoc: row.studioDoc ? stripDesignPx(row.studioDoc) : null,
  });
  const copy = async (o: (typeof objects)[number], key: string): Promise<string> => {
    const bytes = await getObjectBytes(o.key);
    await putObject(key, bytes, o.contentType ?? 'image/png');
    const [made] = await db.insert(storageObjects).values({
      assetId: id,
      objectClass: o.objectClass,
      bucket: o.bucket,
      key,
      contentType: o.contentType,
      byteSize: o.byteSize,
      sha256: o.sha256,
      kmsKeyAlias: o.kmsKeyAlias,
      writeOnce: o.writeOnce,
      exifStripped: o.exifStripped,
    }).returning({ id: storageObjects.id });
    return made!.id;
  };
  let trimmedObjectId: string | null = null;
  try {
    await copy(original, originalKey(id));
    const trimmed = objects.find((o) => o.key === derivativeKey(assetId, 'trimmed'));
    if (trimmed) trimmedObjectId = await copy(trimmed, derivativeKey(id, 'trimmed')); // the drawing every edit works from
    const cutout = objects.find((o) => o.key === derivativeKey(assetId, 'cutout'));
    if (cutout) await copy(cutout, derivativeKey(id, 'cutout')); // the transparency the recipe was made on
  } catch (e) {
    // never a half copy left behind
    await eraseAsset(db, { id, familyId: row.familyId }, { accountId: viewer.accountId, actorType: 'SYSTEM' }, { reason: 'duplicate-failed' });
    throw e;
  }
  return { assetId: id, trimmedObjectId };
}

/** The design's recorded pixel size belongs to ITS design file, not a copy's. */
function stripDesignPx(doc: unknown): unknown {
  if (!doc || typeof doc !== 'object') return doc;
  const rest = { ...(doc as Record<string, unknown>) };
  delete rest.designPx;
  return rest;
}
