import type { Circle, VisibilityTier } from '../domain/types';
import {
  activeMembershipFor,
  canViewAsset,
  childParentOf,
  effectiveVisibility,
  isAdderOrChildParent,
  originatorOf,
  type AssetRef,
  type Decision,
  type Membership,
  type ViewerContext,
} from './policy';
import { circleSees, tierRank } from './tiers';

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
 *  - and to be its CONTROLLER (the adder of their own keepsake, or the little one's parent), or an ACTIVE member with
 *    CONTRIBUTE access. (D27 moved who SETS the tier; what you can DO is still access — a relative set to "view" can't
 *    edit their old upload.)
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
 * Who may change a keepsake's setting, and how far (D27, founder 10 Nov 2026):
 *  - WHOEVER ADDED IT chooses, any tier — but never wider than the little one's parent's ceiling, if they set one.
 *  - On a little one's keepsake someone else added, THE CHILD'S PARENT may only make it more private (that becomes
 *    their ceiling), or lift their own ceiling back up to what the adder chose — never wider (founder answer B).
 *  - Nobody else — not the family leader, not a CONTRIBUTE relative, not a removed member.
 * Only while they hold an ACTIVE membership in the family.
 */
export type VisibilityRole = 'adder' | 'childParent';
export interface VisibilityChoices {
  role: VisibilityRole;
  /** The widest tier this person may pick. */
  widest: VisibilityTier;
  /** What everyone sees now (the adder's choice under the parent's ceiling). */
  current: VisibilityTier;
}

export function visibilityChoicesFor(asset: AssetRef, viewer: ViewerContext): VisibilityChoices | null {
  if (activeMembershipFor(asset, viewer) === null || viewer.accountId === null) return null;
  const current = effectiveVisibility(asset);
  if (viewer.accountId === originatorOf(asset)) return { role: 'adder', widest: asset.parentLimit ?? 'EXTENDED', current };
  if (viewer.accountId === childParentOf(asset)) return { role: 'childParent', widest: asset.visibility, current };
  return null;
}

/** May this viewer change the setting at all? (the "who can see this" sheet opens for them) */
export function canSetAssetVisibility(asset: AssetRef, viewer: ViewerContext): boolean {
  return visibilityChoicesFor(asset, viewer) !== null;
}

/** The change to store for `next`, or a deny: the adder writes `visibility`; the child's parent writes their ceiling. */
export type VisibilityPlan =
  | { allowed: true; role: VisibilityRole; patch: { visibility: VisibilityTier } | { parentLimit: VisibilityTier | null } }
  | { allowed: false; reason: string };

export function planVisibilityChange(asset: AssetRef, viewer: ViewerContext, next: VisibilityTier): VisibilityPlan {
  const choices = visibilityChoicesFor(asset, viewer);
  if (!choices) return { allowed: false, reason: 'only whoever added it, or the little one’s parent, may change who sees it' };
  if (tierRank(next) < 0) return { allowed: false, reason: 'unknown tier' };
  if (tierRank(next) > tierRank(choices.widest)) {
    return { allowed: false, reason: choices.role === 'adder' ? 'the little one’s parent has kept this one narrower' : 'the child’s parent can make it more private, never wider' };
  }
  if (choices.role === 'adder') return { allowed: true, role: 'adder', patch: { visibility: next } };
  // the parent's ceiling; back at the adder's own choice = no ceiling
  return { allowed: true, role: 'childParent', patch: { parentLimit: next === asset.visibility ? null : next } };
}

/**
 * Delete an asset (the keepsake + its bytes) — whoever added it, or the little one's parent (D27: the parent can
 * always take a child's keepsake off), and only while they hold an ACTIVE membership. A CONTRIBUTE relative who
 * didn't add it, an Extended-circle member, the family leader of an adult's own keepsake, or a removed member can
 * never delete it. NN8 + children's-data rules: originals are deletable on demand.
 */
export function canDeleteAsset(asset: AssetRef, viewer: ViewerContext): boolean {
  return activeMembershipFor(asset, viewer) !== null && isAdderOrChildParent(asset, viewer.accountId);
}

/** The frozen gift link, as authz needs it (resolved server-side from the token). */
export interface GiftLinkGrant {
  familyId: string;
  status: 'ACTIVE' | 'REVOKED';
  expiresAt: Date;
  /** The asset ids frozen into the link's snapshot at creation. */
  assetIds: readonly string[];
  /**
   * D27: whose eyes the link shows — ONE person's (founder: one link per person). Only keepsakes this circle may see
   * are on it, checked live. null = a link made before D27, shared with many: extended-level only.
   */
  audienceCircle: Circle | null;
}

/** The keepsake a gift-link line would print, as stored now. */
export interface GiftLinkAssetRef {
  id: string;
  /** null for a never-kept ephemeral draft — which can never match a link's family. */
  familyId: string | null;
  moderationStatus: string;
  /** The keepsake's CURRENT tier — the adder (or the child's parent) can pull an item back after sharing. */
  visibility: VisibilityTier;
  /** The child's parent's ceiling, if any (D27). */
  parentLimit: VisibilityTier | null;
}

/** The circle a gift link shows for (a pre-D27 shared link: extended, since anyone may hold it). */
export const giftLinkAudience = (link: Pick<GiftLinkGrant, 'audienceCircle'>): Circle => link.audienceCircle ?? 'EXTENDED';

/** Would this keepsake show on a link for this circle? (tier × circle, via the one ladder in tiers.ts) */
export function giftLinkShows(audience: Circle, asset: Pick<GiftLinkAssetRef, 'visibility' | 'parentLimit'>): boolean {
  return circleSees(audience, effectiveVisibility(asset));
}

/**
 * Buy a keepsake THROUGH a gift link — a capability, not a membership. The parent
 * sent ONE person an unguessable token naming specific keepsakes; holding it lets its holder
 * (a guest grandparent included — no sign-in) buy exactly those that person's circle may see, and nothing else:
 *  - the link must be ACTIVE and unexpired (revocation bites immediately);
 *  - the asset must be in the link's frozen snapshot AND still in the link's family
 *    (so a token can never be widened to another family's art);
 *  - the asset must still be content-cleared (D8 — never print FLAGGED/BLOCKED);
 *  - its CURRENT effective tier must be one the link's person's circle sees (D27) — so a forwarded link shows only
 *    what the original person could, and pulling an item narrower closes the link for it.
 * It grants PURCHASE only: it never widens who can VIEW the asset in the home.
 */
export function canPurchaseViaGiftLink(link: GiftLinkGrant, asset: GiftLinkAssetRef, now: Date): Decision {
  if (link.status !== 'ACTIVE') return { allowed: false, reason: 'gift link revoked' };
  if (link.expiresAt.getTime() <= now.getTime()) return { allowed: false, reason: 'gift link expired' };
  if (!link.assetIds.includes(asset.id)) return { allowed: false, reason: 'keepsake not in this gift link' };
  if (asset.familyId !== link.familyId) return { allowed: false, reason: 'keepsake not in the gift link family' };
  if (asset.moderationStatus !== 'CLEAR') return { allowed: false, reason: 'keepsake not cleared for printing' };
  if (!giftLinkShows(giftLinkAudience(link), asset)) return { allowed: false, reason: 'keepsake is not shared with this link’s circle' };
  return { allowed: true, reason: 'gift link grants purchase of this keepsake' };
}
