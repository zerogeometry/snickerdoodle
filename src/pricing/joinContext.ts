import type { MembershipStatus } from '@/domain/types';
import { JOIN_SAVING_BPS } from './catalogue';

/**
 * The 5% join saving is the one discount in the product, and a non-negotiable
 * says it must appear ONLY with valid server-side provenance — never from a
 * guest, never for an existing member, and never from a flag the client can set.
 *
 * This is enforced structurally: the pricing engine grants the saving only when
 * handed a {@link JoinContext}, and the ONLY way to mint a JoinContext is
 * {@link resolveJoinContext}, which checks the real invite + membership the
 * server resolved. A client cannot fabricate one — its request carries product
 * keys and a *gift* flag, nothing more.
 */

/** Server-minted proof of a genuine join via a verified gift-link invite. */
export interface JoinContext {
  readonly familyId: string;
  readonly inviteId: string;
  readonly savingBps: number;
}

/** The facts the server resolves from the DB/session to evaluate a join. */
export interface JoinProvenance {
  /** The gift-link invite this checkout is joining through, server-resolved. */
  invite: {
    id: string;
    familyId: string;
    /** Identity verified (invite VERIFIED + verifiedAt set). */
    verified: boolean;
    revoked: boolean;
    /** Epoch ms; the invite must not have expired. */
    expiresAt: number;
  } | null;
  /** The membership created by THIS join (must derive from the invite, be ACTIVE). */
  membership: {
    familyId: string;
    status: MembershipStatus;
    inviteId: string | null;
    isOwner: boolean;
    /** The one-time saving was already spent on an order. */
    savingConsumed: boolean;
  } | null;
  /** Epoch ms — pass an explicit clock so this stays pure/testable. */
  now: number;
}

/**
 * Returns a {@link JoinContext} ONLY for a genuine, verified, in-window join;
 * otherwise null. Fail-closed: any missing/odd input yields no saving.
 */
export function resolveJoinContext(p: JoinProvenance): JoinContext | null {
  const { invite, membership, now } = p;
  if (!invite || !membership) return null; // guest, or no join happening
  if (!invite.verified) return null; // identity not verified
  if (invite.revoked) return null; // parent revoked the link
  if (invite.expiresAt <= now) return null; // link expired
  if (membership.status !== 'ACTIVE') return null; // removed / left ⇒ no saving
  if (membership.savingConsumed) return null; // one-time: already spent
  if (membership.isOwner) return null; // owner isn't "joining" via an invite
  if (membership.inviteId !== invite.id) return null; // membership must come from THIS invite
  if (membership.familyId !== invite.familyId) return null; // cross-family guard
  return { familyId: invite.familyId, inviteId: invite.id, savingBps: JOIN_SAVING_BPS };
}
