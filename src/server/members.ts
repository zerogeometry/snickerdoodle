import { randomBytes } from 'node:crypto';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { accounts, auditRecords, families, invites, memberships, sessions } from '@/db/schema';
import { AuthzError, canManageFamily, type ViewerContext } from '@/authz';
import type { AccessLevel, Circle } from '@/domain/types';
import { circleAllowedFor } from '@/domain/relationships';
import type { DbHandle } from './db';
import { recordErasure } from './erasureLedger';
import { revokeAppTokens } from './app/link';
import { sendMail, type MailMessage } from './mail';
import { memberAccessChangedEmail, memberRemovedEmail } from './mail/familyNotices';
import { moveIntoHomeEmail } from './mail/familyInvite';

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

/**
 * Tell the member themself what changed (sweep 04): to their own address only, naming the parent
 * by first name, with no child data. A mail hiccup never undoes the change — it's logged for ops.
 */
async function tellMember(
  db: DbHandle,
  familyId: string,
  memberAccountId: string,
  build: (who: { to: string; memberName: string | null; ownerName: string | null }) => MailMessage,
) {
  try {
    const [member] = await db.select({ email: accounts.email, name: accounts.displayName }).from(accounts).where(eq(accounts.id, memberAccountId));
    const [owner] = await db
      .select({ name: accounts.displayName })
      .from(families)
      .innerJoin(accounts, eq(accounts.id, families.ownerAccountId))
      .where(eq(families.id, familyId));
    if (!member) return;
    await sendMail(build({ to: member.email, memberName: member.name, ownerName: owner?.name ?? null }));
  } catch (e) {
    console.error('[members] the change notice to the member failed', e instanceof Error ? e.message : e);
  }
}

const CIRCLES: Circle[] = ['HOME', 'FAMILY', 'EXTENDED'];
const MOVE_INVITE_TTL_DAYS = 14;
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
  // and any Snickerdoodle Draw phone of theirs linked to this family (only owners can link, so this
  // is belt and braces — the key also re-checks the membership on every call)
  await revokeAppTokens(db, { accountId: input.memberAccountId, familyId: input.familyId }, 'member-removed', { accountId: ownerId, actorType: 'MEMBER' });
  await recordErasure({ kind: 'membership', familyId: input.familyId, accountId: input.memberAccountId, status: 'REMOVED' });
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: ownerId,
    actorType: 'MEMBER',
    event: 'MEMBER_REMOVED',
    targetType: 'account',
    targetId: input.memberAccountId,
  });
  await tellMember(db, input.familyId, input.memberAccountId, (who) => memberRemovedEmail(who));
  return { ok: true };
}

/**
 * Change what a member can SEE (circle) and/or DO (access) — orthogonal, each audited as its own
 * event. Only values from the closed sets are accepted, and a circle only where their relationship may
 * have it (home: a parent or grown-up child — D27).
 *
 * Moving someone INTO home never happens on the leader's say alone (D27): joining home means accepting that the
 * leader looks after the family's keepsakes and details, so they get a "move into the home" link and stay where
 * they are until they say yes ({@link acceptInvite}). Anything narrower takes effect at once.
 */
export async function setMemberAccess(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; memberAccountId: string; circle?: Circle; accessLevel?: AccessLevel },
): Promise<{ ok: boolean; homeAsked?: boolean }> {
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
  const [before] = await db
    .select({ id: memberships.id, circle: memberships.circle, accessLevel: memberships.accessLevel, relationship: memberships.relationship })
    .from(memberships)
    .where(where);
  if (!before) return { ok: false };
  if (input.circle !== undefined && !circleAllowedFor(before.relationship, input.circle)) return { ok: false };

  // into home: ask them; their own yes moves them (nothing changes here yet)
  let homeAsked = false;
  if (input.circle === 'HOME' && before.circle !== 'HOME') {
    await askIntoHome(db, { by: 'leader', ownerId }, input.familyId, before.id, input.memberAccountId, input.accessLevel ?? before.accessLevel);
    homeAsked = true;
    input = { ...input, circle: undefined };
    if (input.accessLevel === undefined) return { ok: true, homeAsked };
  }

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
  if (audits.length) {
    // only when something really changed — and only to them
    await tellMember(db, input.familyId, input.memberAccountId, (who) =>
      memberAccessChangedEmail({ ...who, circle: input.circle ?? before.circle, accessLevel: input.accessLevel ?? before.accessLevel }),
    );
  }
  return { ok: true, ...(homeAsked ? { homeAsked } : {}) };
}

/**
 * The "move into the home" link (D27): a single-use invite bound to the member's own address and membership, at the
 * home circle. Any earlier one still waiting is replaced. Audited as an invite; the move itself is audited when they
 * say yes.
 */
async function askIntoHome(
  db: DbHandle,
  asker: { by: 'leader' | 'go-live'; ownerId: string },
  familyId: string,
  membershipId: string,
  memberAccountId: string,
  accessLevel: AccessLevel,
) {
  const ownerId = asker.ownerId;
  const [member] = await db.select({ email: accounts.email, name: accounts.displayName }).from(accounts).where(eq(accounts.id, memberAccountId));
  if (!member) return;
  const [m] = await db.select({ relationship: memberships.relationship, seesOccasions: memberships.seesOccasions }).from(memberships).where(eq(memberships.id, membershipId));
  await db
    .update(invites)
    .set({ status: 'REVOKED' })
    .where(and(eq(invites.familyId, familyId), eq(invites.membershipId, membershipId), eq(invites.status, 'PENDING')));
  const token = randomBytes(24).toString('base64url');
  const [invite] = await db
    .insert(invites)
    .values({
      familyId,
      createdByAccountId: ownerId,
      email: member.email.toLowerCase(),
      relationship: m!.relationship,
      circle: 'HOME',
      accessLevel,
      shareOccasions: m!.seesOccasions,
      membershipId,
      token,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + MOVE_INVITE_TTL_DAYS * 86_400_000),
    })
    .returning({ id: invites.id });
  await db.insert(auditRecords).values({
    familyId,
    actorAccountId: asker.by === 'leader' ? ownerId : null,
    actorType: asker.by === 'leader' ? 'MEMBER' : 'SYSTEM',
    event: 'INVITE_SENT',
    targetType: 'invite',
    targetId: invite!.id,
    metadata: { kind: 'move-into-home', member: memberAccountId, ...(asker.by === 'go-live' ? { reason: 'D27: home circle launched — partners and grown-up children asked in' } : {}) },
  });
  const [owner] = await db.select({ name: accounts.displayName }).from(accounts).where(eq(accounts.id, ownerId));
  try {
    await sendMail(moveIntoHomeEmail({ to: member.email, token, inviterName: owner?.name ?? null, memberName: member.name, newCircle: asker.by === 'go-live' }));
  } catch (e) {
    console.error('[members] the move-into-home email failed', e instanceof Error ? e.message : e);
  }
}

/**
 * The home circle's go-live step (founder, 10 Nov 2026): partners / co-parents and grown-up children already in a
 * family (they joined before home existed, so they sit in family or extended) are each ASKED into home — the same
 * "move into the home" link and yes card as the leader's own ask; they move only when they say yes (joining home
 * means agreeing that the leader looks after the family's keepsakes and details). Each membership is asked ONCE,
 * ever: anyone already asked (answered, ignored or cancelled) is skipped, so this is safe to run on every deploy.
 * Their move is audited when they say yes (MEMBERSHIP_CIRCLE_CHANGED); each ask is audited as a system INVITE_SENT.
 */
export async function askPartnersIntoHome(db: DbHandle, opts: { familyIds?: string[] } = {}): Promise<{ asked: number }> {
  const rows = await db
    .select({ id: memberships.id, familyId: memberships.familyId, accountId: memberships.accountId, accessLevel: memberships.accessLevel, ownerId: families.ownerAccountId })
    .from(memberships)
    .innerJoin(families, eq(families.id, memberships.familyId))
    .where(
      and(
        eq(memberships.status, 'ACTIVE'),
        eq(memberships.isOwner, false),
        inArray(memberships.relationship, ['PARENT', 'ADULT_CHILD']),
        ne(memberships.circle, 'HOME'),
        sql`NOT EXISTS (SELECT 1 FROM ${invites} i WHERE i.membership_id = ${memberships.id})`,
        opts.familyIds ? inArray(memberships.familyId, opts.familyIds) : undefined,
      ),
    );
  for (const r of rows) await askIntoHome(db, { by: 'go-live', ownerId: r.ownerId }, r.familyId, r.id, r.accountId, r.accessLevel);
  return { asked: rows.length };
}

/** Is a "move into the home" ask still waiting for this member? (the member's card says so) */
export async function pendingHomeAsks(db: DbHandle, familyId: string): Promise<Set<string>> {
  const rows = await db
    .select({ membershipId: invites.membershipId })
    .from(invites)
    .where(and(eq(invites.familyId, familyId), eq(invites.status, 'PENDING'), sql`${invites.membershipId} IS NOT NULL`, sql`${invites.expiresAt} > now()`));
  return new Set(rows.map((r) => r.membershipId!));
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
): Promise<{ ok: true; email: string; token: string; inviteeName: string | null } | { ok: false }> {
  const ownerId = assertOwnerOf(owner, input.familyId, 'resend an invite');
  const token = randomBytes(24).toString('base64url');
  const [inv] = await db
    .update(invites)
    .set({ token, expiresAt: new Date(Date.now() + 14 * 86_400_000) })
    .where(and(eq(invites.id, input.inviteId), eq(invites.familyId, input.familyId), eq(invites.status, 'PENDING')))
    .returning({ email: invites.email, inviteeName: invites.inviteeName });
  if (!inv) return { ok: false };
  await db.insert(auditRecords).values({ familyId: input.familyId, actorAccountId: ownerId, actorType: 'MEMBER', event: 'INVITE_SENT', targetType: 'invite', targetId: input.inviteId, metadata: { resent: true } });
  return { ok: true, email: inv.email, token, inviteeName: inv.inviteeName };
}
