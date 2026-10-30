import { and, eq, isNotNull } from 'drizzle-orm';
import { subProcessors } from '@/db/schema';
import type { DbHandle } from '@/server/db';

/**
 * THE child-image POD egress chokepoint (proposal/04 §7). Every path that would send a
 * print asset's bytes to a third-party print-on-demand provider MUST pass through
 * {@link assertPodEgressAllowed} first — the way every signed-URL mint passes through
 * authz. It is a SERVER-SIDE, asset-aware predicate, NOT an env flag (a lone flag is
 * exactly what gets flipped in prod by accident).
 *
 * Invariant: no live child image leaves the VPC to a POD until LG3 (transfer-risk
 * assessment) + LG6 (Article 28 DPA with the POD, recorded in the sub_processors
 * register) are green. Order submission itself is Phase 3 and not built yet — this gate
 * is defined now, in the correct shape and tested as a launch gate, so the future
 * submitOrder inherits a gate that can actually see the asset and the register.
 */

export class GateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateError';
  }
}

/** The asset fields the gate decides on — resolved SERVER-SIDE, never from the client. */
export interface EgressAsset {
  childSubjectId: string | null;
  kind: 'DRAWING' | 'PHOTO';
  /** A brand-safe test image (set only outside production — see ingest). Default false. */
  isBrandSafeFixture?: boolean;
}

export interface GateEnv {
  /** SANDBOX (the default) can NEVER carry a child image — the test path is brand-safe
   * by construction. LIVE is the only mode that can, and only when both gates are green. */
  podMode: 'SANDBOX' | 'LIVE';
  /** LG3 — set ONLY by the documented DP transfer-assessment sign-off process. */
  lg3SignedOff: boolean;
}

/** Resolve the gate env from process.env, defaulting to the SAFE posture (SANDBOX). */
export function gateEnv(): GateEnv {
  return {
    podMode: process.env.POD_MODE === 'LIVE' ? 'LIVE' : 'SANDBOX',
    lg3SignedOff: process.env.LG3_TRANSFER_ASSESSMENT_SIGNED_OFF === 'true',
  };
}

/**
 * Is this a child's image? EVERY user upload is treated as one (G11 / DPIA OQ-7): every
 * upload path labels its asset DRAWING and plenty are never filed under a named child, so
 * "linked subject or PHOTO" let real children's art through. The ONLY exception is an image
 * explicitly marked a brand-safe test fixture — which can only happen outside production.
 */
export function isChildImage(asset: EgressAsset): boolean {
  return asset.isBrandSafeFixture !== true;
}

/**
 * Authorise (or refuse) sending ONE asset's bytes to the POD. Throws {@link GateError}
 * when egress is not allowed. The ONLY place that authorises bytes → POD.
 */
export async function assertPodEgressAllowed(db: DbHandle, asset: EgressAsset, env: GateEnv = gateEnv()): Promise<void> {
  const child = isChildImage(asset);

  if (env.podMode === 'SANDBOX') {
    if (child) throw new GateError('child image may not be sent even to the POD sandbox');
    return; // non-child test art → OK
  }

  // LIVE
  if (!child) return; // non-child art is allowed live too
  // LIVE + child → BOTH gates green, verified against the register (not a flag):
  const signedPod = await db
    .select({ id: subProcessors.id })
    .from(subProcessors)
    .where(and(eq(subProcessors.role, 'POD'), isNotNull(subProcessors.dpaSignedAt), isNotNull(subProcessors.transferMechanism)))
    .limit(1);
  const dpaGreen = signedPod.length > 0; // LG6
  if (!(env.lg3SignedOff && dpaGreen)) {
    throw new GateError('LG3 transfer assessment + Article 28 DPA not green — child-image POD egress blocked');
  }
}

/** Why a line is held when its keepsake isn't CLEAR — on the line (renderError) and the order. */
export const HELD_FOR_SAFETY_CHECK = 'held for a safety check — the keepsake isn’t cleared for printing';

/**
 * The content-safety half of the print step (D8). placeOrder only takes a CLEAR keepsake, but one can
 * be reported or re-screened AFTER payment (a gift-link report, a family member's report, a review
 * decision) — so the worker re-checks before it renders, the submitter re-checks at the egress moment,
 * and the release sweep re-checks before it lets a held line go. Anything but CLEAR (FLAGGED, BLOCKED,
 * still PENDING) is held: the line waits as BLOCKED_GATE, the order stays PAID and visible — nothing
 * is lost, and nothing prints until a reviewer clears it.
 */
export function assertClearedForPrint(asset: { moderationStatus: string | null | undefined }): void {
  if (asset.moderationStatus !== 'CLEAR') throw new GateError(HELD_FOR_SAFETY_CHECK);
}
