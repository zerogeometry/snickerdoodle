import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { AuthzError, canManageFamily, type ViewerContext } from '@/authz';
import { auditRecords, families, invites, memberships } from '@/db/schema';
import { defaultCircleFor } from '@/domain/relationships';
import type { AccessLevel, Relationship } from '@/domain/types';
import type { DbHandle } from './db';
import { familyNameForRelatives } from './onboarding';

const INVITE_TTL_DAYS = 14;

export interface CreateInviteInput {
  familyId: string;
  email: string;
  relationship: Relationship;
  accessLevel: AccessLevel;
  /** Share the family calendar (children's birthdays) with them — the parent's explicit
   * choice (pre-ticked in the invite form). Absent ⇒ not shared. */
  shareOccasions?: boolean;
}

/**
 * A parent-initiated invite (NN3: only a parent initiates invites and sets
 * access; no self-join). The circle is derived server-side from the relationship
 * — never trusted from the client. The invite confers nothing until it's accepted
 * by someone who proves they control the invited email (identity, not authority).
 */
export async function createInvite(
  db: DbHandle,
  inviter: ViewerContext,
  input: CreateInviteInput,
): Promise<{ inviteId: string; token: string; email: string }> {
  if (
    inviter.accountId === null ||
    !canManageFamily(inviter.membership) ||
    inviter.membership!.familyId !== input.familyId
  ) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can invite' });
  }

  const email = input.email.trim().toLowerCase();
  const circle = defaultCircleFor(input.relationship); // server-authoritative
  const token = randomBytes(24).toString('base64url'); // unguessable
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  const [invite] = await db
    .insert(invites)
    .values({
      familyId: input.familyId,
      createdByAccountId: inviter.accountId,
      email,
      relationship: input.relationship,
      circle,
      accessLevel: input.accessLevel,
      shareOccasions: input.shareOccasions === true,
      token,
      status: 'PENDING',
      expiresAt,
    })
    .returning();

  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: inviter.accountId,
    actorType: 'MEMBER',
    event: 'INVITE_SENT',
    targetType: 'invite',
    targetId: invite!.id,
    metadata: { email, circle, accessLevel: input.accessLevel, shareOccasions: input.shareOccasions === true },
  });

  return { inviteId: invite!.id, token, email };
}

export interface InviteDisplay {
  email: string;
  /** null ⇒ unnamed family (neutral wording on the join page). */
  familyName: string | null;
  status: string;
  expired: boolean;
}

/** Public-safe details for the /join page (no token-derived secrets leaked). */
export async function getInviteForDisplay(db: DbHandle, token: string): Promise<InviteDisplay | null> {
  const [row] = await db
    .select({ invite: invites, familyName: families.displayName })
    .from(invites)
    .innerJoin(families, eq(invites.familyId, families.id))
    .where(eq(invites.token, token));
  if (!row) return null;
  return {
    email: row.invite.email,
    familyName: familyNameForRelatives(row.familyName),
    status: row.invite.status,
    expired: row.invite.expiresAt <= new Date(),
  };
}

export interface AcceptResult {
  ok: boolean;
  reason?: 'not-found' | 'used' | 'expired' | 'wrong-account';
  familyId?: string;
}

/**
 * Accept an invite. Verification confirms IDENTITY: the signed-in account must
 * control the invited email. Creates an ACTIVE membership at the invite's circle
 * and access (the only membership path besides the owner). Single-use: the invite
 * flips to VERIFIED.
 */
export async function acceptInvite(
  db: DbHandle,
  account: { id: string; email: string },
  token: string,
): Promise<AcceptResult> {
  const [invite] = await db.select().from(invites).where(eq(invites.token, token));
  if (!invite) return { ok: false, reason: 'not-found' };
  if (invite.status !== 'PENDING') return { ok: false, reason: 'used' };
  if (invite.expiresAt <= new Date()) return { ok: false, reason: 'expired' };
  if (account.email.trim().toLowerCase() !== invite.email.toLowerCase()) {
    return { ok: false, reason: 'wrong-account' }; // identity check
  }

  const existing = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.familyId, invite.familyId),
        eq(memberships.accountId, account.id),
        eq(memberships.status, 'ACTIVE'),
      ),
    );

  if (!existing[0]) {
    await db.insert(memberships).values({
      familyId: invite.familyId,
      accountId: account.id,
      relationship: invite.relationship,
      circle: invite.circle,
      accessLevel: invite.accessLevel,
      seesOccasions: invite.shareOccasions,
      status: 'ACTIVE',
      isOwner: false,
      inviteId: invite.id,
      joinedAt: new Date(),
    });
    await db.insert(auditRecords).values([
      { familyId: invite.familyId, actorAccountId: account.id, actorType: 'MEMBER', event: 'INVITE_ACCEPTED', targetType: 'invite', targetId: invite.id },
      { familyId: invite.familyId, actorAccountId: account.id, actorType: 'MEMBER', event: 'MEMBERSHIP_CREATED', targetType: 'account', targetId: account.id },
    ]);
  }

  await db.update(invites).set({ status: 'VERIFIED', verifiedAt: new Date() }).where(eq(invites.id, invite.id));
  return { ok: true, familyId: invite.familyId };
}

/**
 * The parent turns the family calendar (children's birthdays) on or off for one member.
 * Owner-only; audited as an access change; takes effect on the member's next page load.
 */
export async function setMemberSeesOccasions(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; memberAccountId: string; on: boolean },
): Promise<{ ok: boolean }> {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== input.familyId) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can change who sees the family calendar' });
  }
  const updated = await db
    .update(memberships)
    .set({ seesOccasions: input.on })
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
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: owner.accountId,
    actorType: 'MEMBER',
    event: 'MEMBERSHIP_ACCESS_CHANGED',
    targetType: 'account',
    targetId: input.memberAccountId,
    metadata: { seesOccasions: input.on },
  });
  return { ok: true };
}
