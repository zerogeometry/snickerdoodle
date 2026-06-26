import { and, eq } from 'drizzle-orm';
import { assets, auditRecords, memberships } from '@/db/schema';
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
  return ref;
}

/**
 * The authz gate that MUST front any signed-URL mint. Storage isn't wired yet, so
 * the grant is a placeholder — but the point stands: no bytes are ever addressed
 * without an ALLOW from the policy first.
 */
export async function getAssetDownloadGrant(
  db: DbHandle,
  assetId: string,
  viewer: ViewerContext,
): Promise<{ assetId: string; url: string }> {
  const ref = await getViewableAssetOrThrow(db, assetId, viewer);
  return { assetId: ref.id, url: `signed-url://pending-storage/${ref.id}` };
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
