import type { AccessLevel, Circle, MembershipStatus, VisibilityTier } from '../domain/types';

/**
 * The central authorization policy — the single tested place that owns
 * "who can see what" (docs/04 engineering invariant; NN1/NN2/NN3).
 *
 * It is PURE: it takes already-resolved inputs and returns a decision. The
 * service layer resolves the viewer's membership in the asset's family and
 * passes it in; this module re-checks status and family-scope as defence-in-
 * depth, so a stale, removed, or wrong-family membership can never grant access.
 *
 * Never call object storage or mint a signed URL without an ALLOW from here.
 */

export interface AssetRef {
  id: string;
  /** Tenancy key — the first thing the policy checks. NULL only for a pre-account
   * ephemeral draft, which is gated by its upload claim instead (STEP 0). */
  familyId: string | null;
  uploaderAccountId: string | null;
  /**
   * Resolved controller: the controlling parent for a child's asset, otherwise
   * the uploader. ONLY_ME is keyed on THIS, never on the raw uploader, so a
   * contributing relative can't lock the controlling parent out, and a parent's
   * ONLY_ME asset of their child isn't visible to a co-uploader. NULL only for an
   * ephemeral draft (no account yet).
   */
  controllerAccountId: string | null;
  visibility: VisibilityTier;
  /**
   * Set ONLY for a pre-account ephemeral upload (a guest's draft, no family yet).
   * When set, the asset is gated SOLELY by this single-use claim — never by family
   * scope — and grants access to exactly this one asset. Null for every real asset.
   */
  ephemeralClaimId?: string | null;
  /**
   * An OPEN viewer report is holding this keepsake for review (D8; founder, 26 Oct). While held,
   * only its uploader/controller (and the access-controlled review queue) can see it — relatives
   * can't, until a reviewer clears it. Required, so every caller has to decide it
   * (src/server/assetRef.ts assetRefOf).
   */
  heldForReview: boolean;
}

export interface Membership {
  familyId: string;
  accountId: string;
  circle: Circle;
  accessLevel: AccessLevel;
  status: MembershipStatus;
  isOwner: boolean;
}

/**
 * The viewer's identity plus their membership IN the asset's family (resolved by
 * the caller; null when they have none). `accountId` is null for guest/anonymous.
 * `uploadClaim` is the single-use claim a guest holds for their own ephemeral
 * draft (from the signed upload-claim cookie); null for everyone else.
 */
export interface ViewerContext {
  accountId: string | null;
  membership: Membership | null;
  uploadClaim?: string | null;
}

export interface Decision {
  allowed: boolean;
  reason: string;
}

const allow = (reason: string): Decision => ({ allowed: true, reason });
const deny = (reason: string): Decision => ({ allowed: false, reason });

/** The viewer's membership in the asset's family, but only if genuinely usable. */
export function activeMembershipFor(asset: AssetRef, viewer: ViewerContext): Membership | null {
  const m = viewer.membership;
  if (
    m !== null &&
    m.status === 'ACTIVE' &&
    m.familyId === asset.familyId &&
    viewer.accountId !== null &&
    m.accountId === viewer.accountId
  ) {
    return m;
  }
  return null;
}

function isOwnerOrController(asset: AssetRef, viewer: ViewerContext): boolean {
  return (
    viewer.accountId !== null &&
    (viewer.accountId === asset.uploaderAccountId ||
      viewer.accountId === asset.controllerAccountId)
  );
}

/**
 * Can this viewer SEE this asset? The nesting (docs/04):
 *   ONLY_ME  -> controller alone
 *   FAMILY   -> controller + Family-circle members
 *   EXTENDED -> controller + Family-circle + Extended-circle members
 * So a Family-circle member sees FAMILY *and* EXTENDED; an Extended-circle member
 * sees EXTENDED only. Nothing is ever public; default-deny.
 *
 * Scope: this governs FAMILY-SCOPED keepsakes (every asset has a familyId). The
 * pre-account "wow" upload (a logged-out draft with no family yet) is a session-
 * owned draft and is gated by a separate session-ownership check, not this module.
 */
export function canViewAsset(asset: AssetRef, viewer: ViewerContext): Decision {
  // STEP 0 — a pre-account EPHEMERAL draft is gated SOLELY by its upload claim and
  // is NOT family-scoped. The claim grants access to exactly the one asset it was
  // minted for; a claim never unlocks any other (real, family-scoped) asset. A real
  // asset (ephemeralClaimId == null) ignores the claim entirely and falls through.
  if (asset.ephemeralClaimId != null) {
    const claim = viewer.uploadClaim ?? null;
    return claim !== null && claim === asset.ephemeralClaimId
      ? allow('ephemeral draft: viewer holds the matching upload claim')
      : deny('ephemeral draft: requires the matching upload claim');
  }

  const membership = activeMembershipFor(asset, viewer);

  // STEP 1 — family-scope precondition (tenancy isolation), evaluated FIRST.
  // An ACTIVE membership in the asset's family is required for ANY access —
  // including the original uploader and the controller. No active membership =>
  // no access, so removal/leaving revokes access immediately (docs/04), a member
  // of another family is shut out, and a stale membership never grants access.
  if (membership === null) {
    return deny('no active membership in the asset family');
  }

  const ownerOrController = isOwnerOrController(asset, viewer);

  // STEP 2 — ONLY_ME: visible to the controller alone.
  if (asset.visibility === 'ONLY_ME') {
    return viewer.accountId !== null && asset.controllerAccountId !== null && viewer.accountId === asset.controllerAccountId
      ? allow('only_me: viewer is the controller')
      : deny('only_me: visible to the controller alone');
  }

  // STEP 3 — the uploader/controller always sees their own (non-ONLY_ME) asset.
  if (ownerOrController) {
    return allow('viewer is the uploader/controller');
  }

  // STEP 3b — reported and held for review: hidden from everyone but the uploader/controller.
  if (asset.heldForReview) {
    return deny('held for review after a report');
  }

  // STEP 4 — tier x circle (an active membership is guaranteed past step 1).
  if (asset.visibility === 'FAMILY') {
    return membership.circle === 'FAMILY'
      ? allow('family asset visible to a Family-circle member')
      : deny('family asset not visible to an Extended-circle member');
  }
  if (asset.visibility === 'EXTENDED') {
    return allow('extended asset visible to any active member of the circle');
  }

  return deny('default-deny');
}

export class AuthzError extends Error {
  constructor(public readonly decision: Decision) {
    super(`authz denied: ${decision.reason}`);
    this.name = 'AuthzError';
  }
}

/** Throwing form for use at a mutation/read boundary. */
export function assertCanViewAsset(asset: AssetRef, viewer: ViewerContext): void {
  const decision = canViewAsset(asset, viewer);
  if (!decision.allowed) {
    throw new AuthzError(decision);
  }
}
