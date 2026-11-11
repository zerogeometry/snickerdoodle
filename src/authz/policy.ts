import type { AccessLevel, Circle, MembershipStatus, VisibilityTier } from '../domain/types';
import { circleSees, effectiveCircle, narrowerTier } from './tiers';

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
  /** The ORIGINATOR — whoever added it (D27: they choose who sees it). Null after a family hand-over, when the
   * controller stands in for them. */
  uploaderAccountId: string | null;
  /**
   * Resolved controller: the little one's controlling parent for a keepsake filed under a child, otherwise the
   * uploader. So when it differs from the uploader, it IS the child's parent — who always sees it and may only
   * narrow it or take it off (D27). NULL only for an ephemeral draft (no account yet).
   */
  controllerAccountId: string | null;
  /** The originator's choice. */
  visibility: VisibilityTier;
  /** D27: the child's parent's ceiling on a keepsake someone else added (null = none). Who sees it is the narrower
   * of `visibility` and this — see {@link effectiveVisibility}. */
  parentLimit: VisibilityTier | null;
  /**
   * Set ONLY for a pre-account ephemeral upload (a guest's draft, no family yet).
   * When set, the asset is gated SOLELY by this single-use claim — never by family
   * scope — and grants access to exactly this one asset. Null for every real asset.
   */
  ephemeralClaimId?: string | null;
  /**
   * The safety checks haven't cleared this keepsake: held by the automatic screening or by a viewer's
   * report, or not screened yet (D8; founder, 26 Oct and 9 Nov). While held, only its
   * originator / child's parent (and the access-controlled review queue) can see it — relatives can't, until
   * a reviewer clears it. Required, so every caller has to decide it (src/server/assetRef.ts assetRefOf).
   */
  heldForReview: boolean;
}

/** Who added it — the person whose choice the setting is (the controller stands in after a hand-over). */
export function originatorOf(asset: Pick<AssetRef, 'uploaderAccountId' | 'controllerAccountId'>): string | null {
  return asset.uploaderAccountId ?? asset.controllerAccountId;
}

/** The little one's parent on a keepsake someone ELSE added (null when the parent added it, or it isn't a child's). */
export function childParentOf(asset: Pick<AssetRef, 'uploaderAccountId' | 'controllerAccountId'>): string | null {
  const originator = originatorOf(asset);
  return asset.controllerAccountId !== null && asset.controllerAccountId !== originator ? asset.controllerAccountId : null;
}

/** Who actually sees it: the adder's choice, held under the child's parent's ceiling. */
export function effectiveVisibility(asset: Pick<AssetRef, 'visibility' | 'parentLimit'>): VisibilityTier {
  return narrowerTier(asset.visibility, asset.parentLimit);
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

/** The two people who always see a keepsake, whatever its setting: whoever added it, and — on a little one's
 * keepsake someone else added — that child's parent (who can never be shut out of their own child's things). */
export function isAdderOrChildParent(asset: AssetRef, accountId: string | null): boolean {
  return accountId !== null && (accountId === originatorOf(asset) || accountId === asset.controllerAccountId);
}

/**
 * Can this viewer SEE this asset? (D27, founder 10 Nov 2026.) Tiers nest, narrowest first:
 *   ONLY_ME  -> whoever added it (+ the little one's parent, on a child's keepsake someone else added)
 *   HOME     -> those two + the home circle (the leader, partner / co-parent, grown-up children)
 *   FAMILY   -> + the family circle
 *   EXTENDED -> + the extended circle
 * So a home member sees HOME, FAMILY and EXTENDED; family sees FAMILY and EXTENDED; extended sees EXTENDED only.
 * The tier used is the EFFECTIVE one — the adder's choice under the child's parent's ceiling. Nothing is ever
 * public; default-deny.
 *
 * Scope: this governs FAMILY-SCOPED keepsakes (every asset has a familyId). The
 * pre-account "wow" upload (a logged-out draft with no family yet) is a session-
 * owned draft and is gated by its upload claim (STEP 0).
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
  // including the person who added it and the child's parent. No active membership =>
  // no access, so removal/leaving revokes access immediately (docs/04), a member
  // of another family is shut out, and a stale membership never grants access.
  if (membership === null) {
    return deny('no active membership in the asset family');
  }

  // STEP 2 — whoever added it, and the little one's parent, always see it (held or not, any tier).
  if (isAdderOrChildParent(asset, viewer.accountId)) {
    return allow(viewer.accountId === originatorOf(asset) ? 'viewer added it' : 'viewer is the little one’s parent');
  }

  const tier = effectiveVisibility(asset);

  // STEP 3 — ONLY_ME: nobody else.
  if (tier === 'ONLY_ME') {
    return deny('only_me: visible to whoever added it (and the child’s parent) alone');
  }

  // STEP 3b — not cleared by the safety checks (screening or a report): hidden from everyone else.
  if (asset.heldForReview) {
    return deny('held for a safety check');
  }

  // STEP 4 — tier x circle (an active membership is guaranteed past step 1; the leader counts as home).
  const circle = effectiveCircle(membership);
  return circleSees(circle, tier)
    ? allow(`${tier.toLowerCase()} keepsake visible to a ${circle.toLowerCase()}-circle member`)
    : deny(`${tier.toLowerCase()} keepsake not visible to a ${circle.toLowerCase()}-circle member`);
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
