import { activeMembershipFor, canViewAsset, type AssetRef, type Decision, type Membership, type ViewerContext } from './policy';

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

/**
 * Change a keepsake's look IN PLACE — save its Studio edits, lift or put back its background, touch
 * up its cut-out (07-B2). Seeing it is not enough: an Extended grandparent or a VIEW / VIEW_BUY
 * member could otherwise overwrite (or wipe) the very design the family's orders print from. Needs:
 *  - to be able to SEE it (family scope, tier × circle, held-for-review — the view policy first);
 *  - and to be its CONTROLLER (the controlling parent), or an ACTIVE member with CONTRIBUTE access.
 * A guest's own pre-account draft is editable by the holder of its upload claim (the view policy
 * already limits it to exactly that one draft).
 */
export function canEditAsset(asset: AssetRef, viewer: ViewerContext): Decision {
  const view = canViewAsset(asset, viewer);
  if (!view.allowed) return view;
  if (asset.ephemeralClaimId != null) return { allowed: true, reason: 'ephemeral draft: the upload-claim holder edits their own draft' };
  if (viewer.accountId !== null && viewer.accountId === asset.controllerAccountId) return { allowed: true, reason: 'viewer is the controller' };
  if (canContributeCreations(activeMembershipFor(asset, viewer))) return { allowed: true, reason: 'viewer has CONTRIBUTE access' };
  return { allowed: false, reason: 'editing needs the controller or CONTRIBUTE access' };
}

/**
 * Order a family keepsake on a product as a member (04-B2 / 07-B4) — Circle decides what you can
 * SEE, Access decides what you can DO: VIEW means look only. Needs to SEE it, and to be its
 * controller or hold VIEW_BUY / CONTRIBUTE. (Buying THROUGH a gift link is a separate capability:
 * {@link canPurchaseViaGiftLink}.)
 */
export function canBuyAsset(asset: AssetRef, viewer: ViewerContext): Decision {
  const view = canViewAsset(asset, viewer);
  if (!view.allowed) return view;
  if (asset.ephemeralClaimId != null) return { allowed: false, reason: 'a draft must be kept before it can be ordered' };
  if (viewer.accountId !== null && viewer.accountId === asset.controllerAccountId) return { allowed: true, reason: 'viewer is the controller' };
  if (canBuyFromGiftList(activeMembershipFor(asset, viewer))) return { allowed: true, reason: 'viewer has VIEW_BUY or CONTRIBUTE access' };
  return { allowed: false, reason: 'view-only access: buying needs VIEW_BUY' };
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

/** The frozen gift link, as authz needs it (resolved server-side from the token). */
export interface GiftLinkGrant {
  familyId: string;
  status: 'ACTIVE' | 'REVOKED';
  expiresAt: Date;
  /** The asset ids frozen into the link's snapshot at creation. */
  assetIds: readonly string[];
}

/** The keepsake a gift-link line would print, as stored now. */
export interface GiftLinkAssetRef {
  id: string;
  /** null for a never-kept ephemeral draft — which can never match a link's family. */
  familyId: string | null;
  moderationStatus: string;
  /** The keepsake's CURRENT tier — the parent can pull an item back to "only me" after sharing. */
  visibility: string;
}

/**
 * Buy a keepsake THROUGH a gift link — a capability, not a membership. The parent
 * shared an unguessable token naming specific keepsakes; holding it lets anyone
 * (a guest grandparent included) buy exactly those, and nothing else:
 *  - the link must be ACTIVE and unexpired (revocation bites immediately);
 *  - the asset must be in the link's frozen snapshot AND still in the link's family
 *    (so a token can never be widened to another family's art);
 *  - the asset must still be content-cleared (D8 — never print FLAGGED/BLOCKED);
 *  - the parent must not have since made it ONLY_ME (pulling it back closes the link for it).
 * It grants PURCHASE only: it never widens who can VIEW the asset in the home.
 */
export function canPurchaseViaGiftLink(link: GiftLinkGrant, asset: GiftLinkAssetRef, now: Date): Decision {
  if (link.status !== 'ACTIVE') return { allowed: false, reason: 'gift link revoked' };
  if (link.expiresAt.getTime() <= now.getTime()) return { allowed: false, reason: 'gift link expired' };
  if (!link.assetIds.includes(asset.id)) return { allowed: false, reason: 'keepsake not in this gift link' };
  if (asset.familyId !== link.familyId) return { allowed: false, reason: 'keepsake not in the gift link family' };
  if (asset.moderationStatus !== 'CLEAR') return { allowed: false, reason: 'keepsake not cleared for printing' };
  if (asset.visibility === 'ONLY_ME') return { allowed: false, reason: 'keepsake made private by the parent' };
  return { allowed: true, reason: 'gift link grants purchase of this keepsake' };
}
