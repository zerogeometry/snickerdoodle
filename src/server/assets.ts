import { and, eq } from 'drizzle-orm';
import { assets, auditRecords, memberships, storageObjects } from '@/db/schema';
import { deleteObjectConfirmed, presignDownload } from '@/storage';
import {
  AuthzError,
  assertCanViewAsset,
  canDeleteAsset,
  canSetAssetVisibility,
  canViewAsset,
  type AssetRef,
  type Membership,
  type ViewerContext,
} from '@/authz';
import type { VisibilityTier } from '@/domain/types';
import type { DbHandle } from './db';
import { recordErasure } from './erasureLedger';
import { forgetAssetPreviews } from './print/previewCache';

/**
 * The server-data layer for assets. EVERY read of an asset leaves this module
 * only after the central authz policy says ALLOW — nothing here trusts the
 * caller for visibility or ownership; it resolves them from the row and the
 * viewer's membership, then asks src/authz. This is the seam a request handler /
 * server action sits behind, and the place a signed-URL mint is gated.
 */

import { assetRefOf } from './assetRef';

type AssetRow = typeof assets.$inferSelect;

function toAssetRef(row: AssetRow): AssetRef {
  return assetRefOf(row);
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
  familyId: string | null,
): Promise<ViewerContext> {
  // No account, or an ephemeral asset with no family → no membership to resolve.
  // (An ephemeral draft is reached via its upload claim, not this path.)
  if (!accountId || !familyId) return { accountId: accountId ?? null, membership: null };
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

/**
 * Resolve the authz viewer for a SPECIFIC asset, honouring EITHER a signed-in
 * member (their membership in the asset's family) OR a held upload claim (for an
 * ephemeral pre-account draft). This is the single bridge the guest + member
 * buy-flow actions use, so the same canViewAsset chokepoint governs both paths.
 */
export async function resolveAssetViewer(
  db: DbHandle,
  assetId: string,
  accountId: string | null,
  uploadClaims: string[],
): Promise<ViewerContext> {
  const [a] = await db
    .select({ familyId: assets.familyId, ephemeralClaimId: assets.ephemeralClaimId })
    .from(assets)
    .where(eq(assets.id, assetId));
  if (!a) return { accountId, membership: null };
  // an ephemeral draft → the viewer must hold its matching claim
  if (a.ephemeralClaimId && uploadClaims.includes(a.ephemeralClaimId)) {
    return { accountId, membership: null, uploadClaim: a.ephemeralClaimId };
  }
  // a real asset → resolve the member's family membership (claims never apply)
  return resolveViewerContext(db, accountId, a.familyId);
}

/**
 * Adopt a guest's ephemeral draft into a signed-in account's family — the "keep"
 * moment. Only the holder of the draft's upload claim may adopt it (verified
 * through the same gate). Adoption resolves the controller (the account), files it
 * in the family keepsake home, and retires the claim + the retention schedule. An
 * already-adopted asset is a no-op for its owner and a denial for anyone else.
 */
export async function adoptEphemeralDraft(
  db: DbHandle,
  accountId: string,
  familyId: string,
  assetId: string,
  uploadClaims: string[],
  opts: { keep: boolean } = { keep: true },
): Promise<void> {
  const viewer = await resolveAssetViewer(db, assetId, accountId, uploadClaims);
  await getViewableAssetOrThrow(db, assetId, viewer); // gate: claim holder (draft) or owner
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!row) throw denied('not found');

  if (row.ephemeralClaimId) {
    // The claim was verified by the gate → file the draft into the family home.
    await db
      .update(assets)
      .set({
        familyId,
        uploaderAccountId: accountId,
        controllerAccountId: accountId,
        ephemeralClaimId: null, // retire the claim — single-use
        // keep: in the keepsake box, off the retention clock. Not kept (a purchase, before the
        // parent has chosen): filed into the family so the order can use it, but still on the
        // clock — the post-purchase "keep it?" choice decides (see keepChoice.ts).
        ...(opts.keep ? { keptInHome: true, purgeAfter: null } : {}),
      })
      .where(and(eq(assets.id, assetId), eq(assets.ephemeralClaimId, row.ephemeralClaimId))); // race guard
  } else if (row.controllerAccountId !== accountId) {
    throw denied('not yours to keep'); // a real asset that isn't theirs
  }
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
  return assertViewableRow(row, viewer);
}

/** The view gate on an asset row already in hand — the ONE place getViewableAssetOrThrow and the
 * signed-URL grant below decide "may this viewer see it". */
function assertViewableRow(row: typeof assets.$inferSelect | undefined, viewer: ViewerContext): AssetRef {
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
  // the object and its owning asset in ONE round trip (a tile's link is minted on every preview)
  const [hit] = await db
    .select({ key: storageObjects.key, asset: assets })
    .from(storageObjects)
    .innerJoin(assets, eq(assets.id, storageObjects.assetId))
    .where(eq(storageObjects.id, storageObjectId));
  if (!hit) throw denied('not found');
  assertViewableRow(hit.asset, viewer); // ← the gate, via the owning asset
  return { url: await presignDownload(hit.key, ttlSeconds) };
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

/**
 * Permanently delete an asset on the controller's demand (NN8 + children's-data
 * rules). Authz-gated to the controlling parent, then:
 *   1. the BYTES are removed from storage, CONFIRMED with retry (a child's
 *      original is provably gone, not best-effort);
 *   2. an append-only ASSET_DELETED audit row is written (before the row is gone);
 *   3. the asset row is dropped — which CASCADES its storage_object rows and nulls
 *      the asset link on any frozen order / ML record.
 * Gift links to it then resolve "gone" (the snapshot serves no missing bytes).
 * Backups are crypto-shredded / excluded from long-lived backups at the infra layer.
 */
export async function deleteAsset(db: DbHandle, assetId: string, viewer: ViewerContext): Promise<void> {
  const row = (await db.select().from(assets).where(eq(assets.id, assetId)))[0];
  if (!row) throw denied('not found');
  if (!canDeleteAsset(toAssetRef(row), viewer)) {
    throw denied('only the controlling parent may delete this keepsake');
  }

  await eraseAsset(db, row, { accountId: viewer.accountId, actorType: 'MEMBER' });
}

/**
 * The erase steps themselves, with NO authorisation check — callers authorise first (deleteAsset
 * via canDeleteAsset; account closure for everything the closing parent controls).
 */
export async function eraseAsset(
  db: DbHandle,
  row: { id: string; familyId: string | null },
  actor: { accountId: string | null; actorType: 'MEMBER' | 'SYSTEM' | 'ADMIN' },
  metadata?: Record<string, unknown>,
  opts: { skipLedger?: boolean } = {},
): Promise<void> {
  // 1. bytes first — never drop the DB record while bytes might linger.
  const objects = await db.select().from(storageObjects).where(eq(storageObjects.assetId, row.id));
  for (const o of objects) {
    await deleteObjectConfirmed(o.key);
  }
  // …and anything the mockup compositor briefly holds in memory made from it (a printed face).
  forgetAssetPreviews(row.id);

  // 2. append-only audit while the family link is still valid.
  await db.insert(auditRecords).values({
    familyId: row.familyId,
    actorAccountId: actor.accountId,
    actorType: actor.actorType,
    event: 'ASSET_DELETED',
    targetType: 'asset',
    targetId: row.id,
    ...(metadata ? { metadata } : {}),
  });

  // 3. drop the row — cascades storage_object rows; nulls order/ML asset links.
  await db.delete(assets).where(eq(assets.id, row.id));

  // 4. outside the DB, so a backup restore can't bring it back (erasureLedger.ts)
  if (!opts.skipLedger) await recordErasure({ kind: 'asset', id: row.id });
}
