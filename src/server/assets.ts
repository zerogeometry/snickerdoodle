import { and, eq } from 'drizzle-orm';
import { assets, auditRecords, memberships, storageObjects } from '@/db/schema';
import { presignDownload } from '@/storage';
import {
  AuthzError,
  assertCanViewAsset,
  canSetAssetVisibility,
  canViewAsset,
  type AssetRef,
  type Membership,
  type ViewerContext,
} from '@/authz';
import type { VisibilityTier } from '@/domain/types';
import type { DbHandle } from './db';

/**
 * The server-data layer for assets. EVERY read of an asset leaves this module
 * only after the central authz policy says ALLOW — nothing here trusts the
 * caller for visibility or ownership; it resolves them from the row and the
 * viewer's membership, then asks src/authz. This is the seam a request handler /
 * server action sits behind, and the place a signed-URL mint is gated.
 */

type AssetRow = typeof assets.$inferSelect;

function toAssetRef(row: AssetRow): AssetRef {
  return {
    id: row.id,
    familyId: row.familyId,
    uploaderAccountId: row.uploaderAccountId,
    controllerAccountId: row.controllerAccountId,
    visibility: row.visibility,
  };
}

/** A denial that is indistinguishable from "not found" — never leak existence. */
function denied(reason: string): AuthzError {
  return new AuthzError({ allowed: false, reason });
}

/**
 * Resolve a viewer's membership IN a given family → the ViewerContext the policy
 * expects. A removed/left member resolves to that (non-ACTIVE) membership, which
 * the policy then rejects — so revocation takes effect immediately.
 */
export async function resolveViewerContext(
  db: DbHandle,
  accountId: string | null,
  familyId: string,
): Promise<ViewerContext> {
  if (!accountId) return { accountId: null, membership: null };
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.familyId, familyId), eq(memberships.accountId, accountId)));
  const chosen = rows.find((r) => r.status === 'ACTIVE') ?? rows[0] ?? null;
  const membership: Membership | null = chosen
    ? {
        familyId: chosen.familyId,
        accountId: chosen.accountId,
        circle: chosen.circle,
        accessLevel: chosen.accessLevel,
        status: chosen.status,
        isOwner: chosen.isOwner,
      }
    : null;
  return { accountId, membership };
}

/** Every asset in a family this viewer is allowed to SEE (filtered via authz). */
export async function listViewableAssets(
  db: DbHandle,
  familyId: string,
  viewer: ViewerContext,
): Promise<AssetRef[]> {
  const rows = await db.select().from(assets).where(eq(assets.familyId, familyId));
  return rows.map(toAssetRef).filter((ref) => canViewAsset(ref, viewer).allowed);
}

/** One asset, or an AuthzError (identical for denied and not-found). */
export async function getViewableAssetOrThrow(
  db: DbHandle,
  assetId: string,
  viewer: ViewerContext,
): Promise<AssetRef> {
  const row = (await db.select().from(assets).where(eq(assets.id, assetId)))[0];
  if (!row) throw denied('not found');
  const ref = toAssetRef(row);
  assertCanViewAsset(ref, viewer); // ← the gate
  // CSAM-blocked content is never viewable/renderable by anyone (D8 runbook).
  if (row.moderationStatus === 'BLOCKED') throw denied('unavailable');
  return ref;
}

type ObjectClass = (typeof storageObjects.$inferSelect)['objectClass'];

/**
 * Mint a short-lived signed URL for one of an asset's stored objects (ORIGINAL by
 * default; DERIVATIVE/CREATION_LAYER for cutouts, upscales, print files) — but
 * ONLY after the authz policy says ALLOW. No bytes are ever addressable without
 * that gate. `url` is null when no such object exists yet; a denied viewer never
 * reaches this point (getViewableAssetOrThrow throws).
 */
export async function getAssetDownloadGrant(
  db: DbHandle,
  assetId: string,
  viewer: ViewerContext,
  opts: { objectClass?: ObjectClass; ttlSeconds?: number } = {},
): Promise<{ assetId: string; url: string | null }> {
  const ref = await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const [object] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, opts.objectClass ?? 'ORIGINAL')));
  if (!object) return { assetId: ref.id, url: null };
  const url = await presignDownload(object.key, opts.ttlSeconds ?? 120);
  return { assetId: ref.id, url };
}

/**
 * Mint a signed URL for a SPECIFIC stored object (e.g. a print-file derivative
 * referenced by id) — gated by the same policy via the object's owning asset. The
 * ONLY sanctioned way to address a derivative's bytes; jobs must never call
 * presignDownload directly.
 */
export async function getStorageObjectGrant(
  db: DbHandle,
  storageObjectId: string,
  viewer: ViewerContext,
  ttlSeconds = 120,
): Promise<{ url: string }> {
  const [object] = await db.select().from(storageObjects).where(eq(storageObjects.id, storageObjectId));
  if (!object) throw denied('not found');
  await getViewableAssetOrThrow(db, object.assetId, viewer); // ← the gate, via the owning asset
  return { url: await presignDownload(object.key, ttlSeconds) };
}

/**
 * Change an asset's visibility. Only the controller may, and only while ACTIVE.
 * Writes an append-only audit row (docs/04: visibility changes are logged).
 */
export async function changeAssetVisibility(
  db: DbHandle,
  assetId: string,
  viewer: ViewerContext,
  next: VisibilityTier,
): Promise<AssetRef> {
  const row = (await db.select().from(assets).where(eq(assets.id, assetId)))[0];
  if (!row) throw denied('not found');
  const ref = toAssetRef(row);
  if (!canSetAssetVisibility(ref, viewer)) {
    throw denied('only the controlling parent may change visibility');
  }
  await db.update(assets).set({ visibility: next }).where(eq(assets.id, assetId));
  await db.insert(auditRecords).values({
    familyId: row.familyId,
    actorAccountId: viewer.accountId,
    actorType: 'MEMBER',
    event: 'ASSET_VISIBILITY_CHANGED',
    targetType: 'asset',
    targetId: assetId,
    metadata: { from: row.visibility, to: next },
  });
  return { ...ref, visibility: next };
}
