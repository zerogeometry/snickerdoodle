import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { auditRecords, invites, memberships, sessions } from '@/db/schema';
import { AuthzError, canManageFamily, type ViewerContext } from '@/authz';
import type { AccessLevel, Circle } from '@/domain/types';
import type { DbHandle } from './db';
import { recordErasure } from './erasureLedger';

/**
 * The parent's controls over who is in the family (parent-is-controller). Every change is
 * owner-only, scoped to the owner's own family, audited, and takes effect on the member's very
 * next request — authz only ever honours ACTIVE memberships, resolved fresh per request.
 */

function assertOwnerOf(owner: ViewerContext, familyId: string, what: string): string {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== familyId) {
    throw new AuthzError({ allowed: false, reason: `only the family owner can ${what}` });
  }
  return owner.accountId;
}

const CIRCLES: Circle[] = ['FAMILY', 'EXTENDED'];
const ACCESS: AccessLevel[] = ['VIEW', 'VIEW_BUY', 'CONTRIBUTE'];

/**
 * Remove a member. Their membership becomes REMOVED (so every family-scoped read denies them at
 * once) and their sessions are invalidated — no grace period on any device. The owner can't
 * remove themselves (they'd orphan the family; closing the account is the path for that).
 */
export async function removeMember(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; memberAccountId: string },
): Promise<{ ok: boolean }> {
  const ownerId = assertOwnerOf(owner, input.familyId, 'remove a member');
  if (input.memberAccountId === ownerId) return { ok: false };
  const updated = await db
    .update(memberships)
    .set({ status: 'REMOVED', revokedAt: new Date() })
    .where(
      and(
        eq(memberships.familyId, input.familyId),
        eq(memberships.accountId, input.memberAccountId),
        eq(memberships.status, 'ACTIVE'),
        eq(memberships.isOwner, false),
      ),
    )
    .returning({ id: memberships.id });
  if (!updated[0]) return { ok: false };
  // "Removal invalidates sessions immediately" (CLAUDE.md): sign them out everywhere.
  await db.delete(sessions).where(eq(sessions.userId, input.memberAccountId));
  await recordErasure({ kind: 'membership', familyId: input.familyId, accountId: input.memberAccountId, status: 'REMOVED' });
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: ownerId,
    actorType: 'MEMBER',
    event: 'MEMBER_REMOVED',
    targetType: 'account',
    targetId: input.memberAccountId,
  });
  return { ok: true };
}

/**
 * Change what a member can SEE (circle) and/or DO (access) — orthogonal, each audited as its own
 * event. Only values from the closed sets are accepted.
 */
export async function setMemberAccess(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; memberAccountId: string; circle?: Circle; accessLevel?: AccessLevel },
): Promise<{ ok: boolean }> {
  const ownerId = assertOwnerOf(owner, input.familyId, 'change a member’s access');
  if (input.circle !== undefined && !CIRCLES.includes(input.circle)) return { ok: false };
  if (input.accessLevel !== undefined && !ACCESS.includes(input.accessLevel)) return { ok: false };
  if (input.circle === undefined && input.accessLevel === undefined) return { ok: false };

  const where = and(
    eq(memberships.familyId, input.familyId),
    eq(memberships.accountId, input.memberAccountId),
    eq(memberships.status, 'ACTIVE'),
    eq(memberships.isOwner, false),
  );
  const [before] = await db.select({ circle: memberships.circle, accessLevel: memberships.accessLevel }).from(memberships).where(where);
  if (!before) return { ok: false };

  await db
    .update(memberships)
    .set({
      ...(input.circle !== undefined ? { circle: input.circle } : {}),
      ...(input.accessLevel !== undefined ? { accessLevel: input.accessLevel } : {}),
    })
    .where(where);

  const audits = [];
  if (input.circle !== undefined && input.circle !== before.circle) {
    audits.push({ event: 'MEMBERSHIP_CIRCLE_CHANGED' as const, metadata: { from: before.circle, to: input.circle } });
  }
  if (input.accessLevel !== undefined && input.accessLevel !== before.accessLevel) {
    audits.push({ event: 'MEMBERSHIP_ACCESS_CHANGED' as const, metadata: { from: before.accessLevel, to: input.accessLevel } });
  }
  if (audits.length) {
    await db.insert(auditRecords).values(
      audits.map((a) => ({
        familyId: input.familyId,
        actorAccountId: ownerId,
        actorType: 'MEMBER' as const,
        event: a.event,
        targetType: 'account',
        targetId: input.memberAccountId,
        metadata: a.metadata,
      })),
    );
  }
  return { ok: true };
}

/** Cancel a pending invite — its link stops working at once (only PENDING invites can be accepted). */
export async function revokeInvite(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; inviteId: string },
): Promise<{ ok: boolean }> {
  const ownerId = assertOwnerOf(owner, input.familyId, 'cancel an invite');
  const updated = await db
    .update(invites)
    .set({ status: 'REVOKED' })
    .where(and(eq(invites.id, input.inviteId), eq(invites.familyId, input.familyId), eq(invites.status, 'PENDING')))
    .returning({ id: invites.id });
  if (!updated[0]) return { ok: false };
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: ownerId,
    actorType: 'MEMBER',
    event: 'INVITE_REVOKED',
    targetType: 'invite',
    targetId: input.inviteId,
  });
  return { ok: true };
}

/**
 * A member leaves a family they were invited into. The owner can't leave their own family.
 * Their sessions stay (they may belong to other families) — the LEFT status alone denies them
 * this family's keepsakes from the next request.
 */
export async function leaveFamily(db: DbHandle, member: ViewerContext, input: { familyId: string }): Promise<{ ok: boolean }> {
  if (member.accountId === null) return { ok: false };
  const updated = await db
    .update(memberships)
    .set({ status: 'LEFT', revokedAt: new Date() })
    .where(
      and(
        eq(memberships.familyId, input.familyId),
        eq(memberships.accountId, member.accountId),
        eq(memberships.status, 'ACTIVE'),
        eq(memberships.isOwner, false),
      ),
    )
    .returning({ id: memberships.id });
  if (!updated[0]) return { ok: false };
  await recordErasure({ kind: 'membership', familyId: input.familyId, accountId: member.accountId, status: 'LEFT' });
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: member.accountId,
    actorType: 'MEMBER',
    event: 'MEMBER_LEFT',
    targetType: 'account',
    targetId: member.accountId,
  });
  return { ok: true };
}

/**
 * Send a pending invite again (owner only): a FRESH link and a fresh fortnight — the old link stops
 * working at once. Returns where to send it; the caller sends the email.
 */
export async function resendInvite(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; inviteId: string },
): Promise<{ ok: true; email: string; token: string } | { ok: false }> {
  const ownerId = assertOwnerOf(owner, input.familyId, 'resend an invite');
  const token = randomBytes(24).toString('base64url');
  const [inv] = await db
    .update(invites)
    .set({ token, expiresAt: new Date(Date.now() + 14 * 86_400_000) })
    .where(and(eq(invites.id, input.inviteId), eq(invites.familyId, input.familyId), eq(invites.status, 'PENDING')))
    .returning({ email: invites.email });
  if (!inv) return { ok: false };
  await db.insert(auditRecords).values({ familyId: input.familyId, actorAccountId: ownerId, actorType: 'MEMBER', event: 'INVITE_SENT', targetType: 'invite', targetId: input.inviteId, metadata: { resent: true } });
  return { ok: true, email: inv.email, token };
}
