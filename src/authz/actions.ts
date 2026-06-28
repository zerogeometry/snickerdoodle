import { activeMembershipFor, type AssetRef, type Membership, type ViewerContext } from './policy';

/**
 * Action checks. Circle decides what you can SEE (see policy.ts); ACCESS LEVEL
 * decides what you can DO. They are orthogonal (docs/04). These take the viewer's
 * resolved membership in the relevant family and re-check ACTIVE status.
 */

function isActive(m: Membership | null): m is Membership {
  return m !== null && m.status === 'ACTIVE';
}

/** Buy from a gift list — needs VIEW_BUY or CONTRIBUTE. */
export function canBuyFromGiftList(membership: Membership | null): boolean {
  return (
    isActive(membership) &&
    (membership.accessLevel === 'VIEW_BUY' || membership.accessLevel === 'CONTRIBUTE')
  );
}

/** Add your own creations to the family — needs CONTRIBUTE. */
export function canContributeCreations(membership: Membership | null): boolean {
  return isActive(membership) && membership.accessLevel === 'CONTRIBUTE';
}

/** Manage the family (invite, remove, change others' access) — owner only for now. */
export function canManageFamily(membership: Membership | null): boolean {
  return isActive(membership) && membership.isOwner;
}

/**
 * Set an asset's visibility — only the asset's controller (the controlling parent
 * for a child's asset), and only while they hold an ACTIVE membership in the family.
 * docs/04: "For a child's asset, the controlling parent sets this."
 */
export function canSetAssetVisibility(asset: AssetRef, viewer: ViewerContext): boolean {
  return (
    activeMembershipFor(asset, viewer) !== null &&
    viewer.accountId !== null &&
    viewer.accountId === asset.controllerAccountId
  );
}

/**
 * Delete an asset (the keepsake + its bytes) — ONLY the asset's controller (the
 * controlling parent for a child's asset), and only while they hold an ACTIVE
 * membership. Deletion is at least as privileged as setting visibility: a co-
 * uploading relative, an Extended-circle member, or a removed member can never
 * delete it. NN8 + children's-data rules: originals are deletable on demand by
 * the controlling parent.
 */
export function canDeleteAsset(asset: AssetRef, viewer: ViewerContext): boolean {
  return (
    activeMembershipFor(asset, viewer) !== null &&
    viewer.accountId !== null &&
    viewer.accountId === asset.controllerAccountId
  );
}
