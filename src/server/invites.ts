import { randomBytes } from 'node:crypto';
import { and, eq, gt, ne, sql } from 'drizzle-orm';
import { AuthzError, canManageFamily, type ViewerContext } from '@/authz';
import { accounts, auditRecords, families, invites, memberships } from '@/db/schema';
import { circleAllowedFor, defaultCircleFor } from '@/domain/relationships';
import { ACCESS_LEVELS, RELATIONSHIPS, type AccessLevel, type Circle, type Relationship } from '@/domain/types';
import { JOIN_CONSENT_VERSION } from '@/lib/joinConsent';
import type { DbHandle } from './db';
import { familyNameForRelatives } from './onboarding';
import { sendMail } from './mail';
import { memberJoinedEmail } from './mail/familyNotices';
import { firstNameOf } from './mail/words';
import { isUnsetDisplayName, screenDisplayName } from './memberName';

const INVITE_TTL_DAYS = 14;

/**
 * The invite can't go: that address already belongs to someone in the family (sweep 04-B4 — an
 * invite to an existing member used to be accepted and then silently change nothing). The parent
 * changes a member's circle/access from their card on /family instead.
 */
export class AlreadyInFamilyError extends Error {
  readonly reason = 'already-member' as const;
  constructor() {
    super('already in the family');
  }
}

/** The invite form sent something the server won't accept (a bad address, a child, an unknown level). */
export class InvalidInviteError extends Error {
  constructor() {
    super('invalid invite');
  }
}

/**
 * A little one can't be invited (NN3: children are subjects, not account holders — sign-off
 * checklist G10). They're added to the family by first name instead, with no email and no account.
 * Also thrown for a relationship or access level that isn't one of ours (never trusted from the form).
 * A kind of InvalidInviteError: every refused invite is one.
 */
export class NotInvitableError extends InvalidInviteError {
  readonly reason = 'not-invitable' as const;
  constructor(readonly why: 'child' | 'relationship' | 'access' | 'circle') {
    super();
    this.message = why === 'child' ? 'children are added by first name, never invited' : `unknown ${why}`;
  }
}

/** Is this address an ACTIVE member of the family already? (case-insensitive, like the join check) */
export async function isActiveMemberEmail(db: DbHandle, familyId: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(memberships.familyId, familyId), eq(memberships.status, 'ACTIVE'), sql`lower(${accounts.email}) = ${email.trim().toLowerCase()}`))
    .limit(1);
  return !!row;
}

export interface CreateInviteInput {
  familyId: string;
  email: string;
  relationship: Relationship;
  accessLevel: AccessLevel;
  /** Share the family calendar (children's birthdays) with them — the parent's explicit
   * choice (pre-ticked in the invite form). Absent ⇒ not shared. */
  shareOccasions?: boolean;
  /** The name the parent typed for them. Screened; kept so it becomes their account name when they
   * join (unless they've chosen their own). An unusable name is dropped, never a refused invite. */
  name?: string | null;
  /** The leader's circle choice (D27: invite-time override). Absent ⇒ the relationship's default. Checked
   * server-side: home only for a parent or grown-up child. */
  circle?: Circle;
}

/** Children are keepsake subjects, never account holders (NN3) — so never invited. */
const INVITABLE_RELATIONSHIPS = new Set<Relationship>(['PARENT', 'ADULT_CHILD', 'GRANDPARENT', 'AUNT_UNCLE', 'CLOSE_FRIEND', 'OTHER']);
const isInvitableEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * A parent-initiated invite (NN3: only a parent initiates invites and sets
 * access; no self-join). The circle is the leader's choice for that relationship, or its default — checked
 * server-side, never trusted from the client (home only for a parent / grown-up child). The invite confers nothing
 * until it's accepted — by someone who proves they control the invited email (identity, not authority) AND says yes
 * on the join card (D27).
 */
export async function createInvite(
  db: DbHandle,
  inviter: ViewerContext,
  input: CreateInviteInput,
): Promise<{ inviteId: string; token: string; email: string; inviteeName: string | null }> {
  if (
    inviter.accountId === null ||
    !canManageFamily(inviter.membership) ||
    inviter.membership!.familyId !== input.familyId
  ) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can invite' });
  }
  if (input.relationship === 'CHILD') throw new NotInvitableError('child');
  if (!(RELATIONSHIPS as readonly string[]).includes(input.relationship)) throw new NotInvitableError('relationship');
  if (!(ACCESS_LEVELS as readonly string[]).includes(input.accessLevel)) throw new NotInvitableError('access');

  const email = input.email.trim().toLowerCase();
  // never trust the client's form: a real address, a grown-up's relationship, one of the three levels
  if (!isInvitableEmail(email) || !INVITABLE_RELATIONSHIPS.has(input.relationship)) {
    throw new InvalidInviteError();
  }
  if (await isActiveMemberEmail(db, input.familyId, email)) throw new AlreadyInFamilyError();
  // server-authoritative: the leader's choice only where that relationship may have it (D27)
  if (input.circle !== undefined && !circleAllowedFor(input.relationship, input.circle)) throw new NotInvitableError('circle');
  const inviteeName = screenDisplayName(input.name);
  const circle = input.circle ?? defaultCircleFor(input.relationship);
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
      inviteeName,
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

  return { inviteId: invite!.id, token, email, inviteeName };
}

export interface InviteDisplay {
  email: string;
  /** null ⇒ unnamed family (neutral wording on the join page). */
  familyName: string | null;
  status: string;
  expired: boolean;
  /** the circle they'd join (the join card's words depend on it) */
  circle: Circle;
  /** the family leader's first name, for "Sam looks after the family's keepsakes" (null ⇒ "the family lead") */
  leaderName: string | null;
  /** an existing member being asked into home (D27), not a new join */
  moving: boolean;
}

/** Public-safe details for the /join page (no token-derived secrets leaked). */
export async function getInviteForDisplay(db: DbHandle, token: string): Promise<InviteDisplay | null> {
  const [row] = await db
    .select({ invite: invites, familyName: families.displayName, leader: accounts.displayName })
    .from(invites)
    .innerJoin(families, eq(invites.familyId, families.id))
    .innerJoin(accounts, eq(accounts.id, families.ownerAccountId))
    .where(eq(invites.token, token));
  if (!row) return null;
  return {
    email: row.invite.email,
    familyName: familyNameForRelatives(row.familyName),
    status: row.invite.status,
    expired: row.invite.expiresAt <= new Date(),
    circle: row.invite.circle,
    leaderName: row.leader?.trim().split(/\s+/)[0] || null,
    moving: row.invite.membershipId !== null,
  };
}

/**
 * For the sign-in email on the way into a family: the inviting parent's FIRST name, so that email
 * says "your link to join Sam’s family" instead of arriving as an unexplained magic link. Only when
 * the link is headed to /join for an invite that's still open AND was sent to this very address —
 * anything else (or any hiccup) gives null and the plain sign-in email goes instead.
 */
export async function inviterForSignInLink(db: DbHandle, email: string, callbackUrl: string | null | undefined): Promise<string | null> {
  let path = '';
  try {
    path = new URL(callbackUrl ?? '', 'http://x').pathname;
  } catch {
    return null;
  }
  const token = /^\/join\/([A-Za-z0-9_-]{16,128})$/.exec(path)?.[1];
  if (!token) return null;
  const [row] = await db
    .select({ inviteEmail: invites.email, status: invites.status, expiresAt: invites.expiresAt, name: accounts.displayName })
    .from(invites)
    .innerJoin(accounts, eq(accounts.id, invites.createdByAccountId))
    .where(eq(invites.token, token));
  if (!row || row.status !== 'PENDING' || row.expiresAt <= new Date()) return null;
  if (row.inviteEmail.toLowerCase() !== email.trim().toLowerCase()) return null;
  return firstNameOf(row.name);
}

/** Where to land after joining. ONLY a gift-link path is honoured (an open redirect is
 * never possible): the relative came from a gift list, so they go back to finish it. */
export function safeJoinNext(raw: string | string[] | null | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^\/g\/[A-Za-z0-9_-]{8,128}$/.test(v) ? v : null;
}

/**
 * The /join page's "email me the link" (06-B1). The invited address never goes to the browser —
 * a forwarded gift link lets anyone open /join — so the SERVER sends the one-tap sign-in link,
 * only ever to the address the parent invited, and only while the invite is still open. The
 * caller learns nothing but ok / not ok. Sign-in links are rate limited per address and device
 * (src/auth), and the link itself is useless to anyone but the invitee's inbox.
 */
export async function sendInviteSignInLink(
  db: DbHandle,
  token: string,
  next: string | null,
  send: (email: string, callbackUrl: string) => Promise<void>,
): Promise<{ ok: boolean }> {
  if (typeof token !== 'string' || !token) return { ok: false };
  const invite = await getInviteForDisplay(db, token);
  if (!invite || invite.status !== 'PENDING' || invite.expired) return { ok: false };
  const safe = safeJoinNext(next);
  await send(invite.email, `/join/${token}${safe ? `?next=${encodeURIComponent(safe)}` : ''}`);
  return { ok: true };
}

export interface AcceptResult {
  ok: boolean;
  reason?: 'not-found' | 'used' | 'expired' | 'wrong-account' | 'no-consent';
  familyId?: string;
}

/**
 * Accept an invite. Verification confirms IDENTITY: the signed-in account must
 * control the invited email. And the joiner must have said YES on the join card (D27 — never a silent join): the
 * consent version they saw is checked and stored on the membership with the moment. Creates an ACTIVE membership at
 * the invite's circle and access (the only membership path besides the owner) — or, for a "move into home" invite,
 * moves their existing membership. Single-use: the invite flips to VERIFIED.
 */
export async function acceptInvite(
  db: DbHandle,
  account: { id: string; email: string },
  token: string,
  consent: { version: string } | null,
): Promise<AcceptResult> {
  const [invite] = await db.select().from(invites).where(eq(invites.token, token));
  if (!invite) return { ok: false, reason: 'not-found' };
  if (invite.status !== 'PENDING') return { ok: false, reason: 'used' };
  if (invite.expiresAt <= new Date()) return { ok: false, reason: 'expired' };
  if (account.email.trim().toLowerCase() !== invite.email.toLowerCase()) {
    return { ok: false, reason: 'wrong-account' }; // identity check
  }
  // …and their own yes on the join card, to the words we showed (D27)
  if (!consent || consent.version !== JOIN_CONSENT_VERSION) return { ok: false, reason: 'no-consent' };

  // All or nothing, and the invite is CLAIMED first: only one accept can flip it from PENDING, so a
  // parent cancelling (or a fresh resend) at the same moment never leaves a membership behind.
  const joined = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(invites)
      .set({ status: 'VERIFIED', verifiedAt: new Date() })
      .where(and(eq(invites.id, invite.id), eq(invites.token, token), eq(invites.status, 'PENDING'), gt(invites.expiresAt, new Date())))
      .returning({ id: invites.id });
    if (!claimed) return null;

    const existing = await tx
      .select({ id: memberships.id, circle: memberships.circle })
      .from(memberships)
      .where(and(eq(memberships.familyId, invite.familyId), eq(memberships.accountId, account.id), eq(memberships.status, 'ACTIVE')));
    const isNew = !existing[0];
    const consentedAt = new Date();
    // a move-into-home link only ever moves the membership it was made for (they left / were removed since → spent)
    if (invite.membershipId !== null && (isNew || invite.membershipId !== existing[0]!.id)) return null;
    if (!isNew && invite.membershipId !== null) {
      // a "move into home" invite (D27): THEIR yes moves them; nothing changed until now
      await tx
        .update(memberships)
        .set({ circle: invite.circle, joinConsentVersion: consent.version, joinConsentedAt: consentedAt })
        .where(eq(memberships.id, invite.membershipId));
      await tx.insert(auditRecords).values({
        familyId: invite.familyId,
        actorAccountId: account.id,
        actorType: 'MEMBER',
        event: 'MEMBERSHIP_CIRCLE_CHANGED',
        targetType: 'account',
        targetId: account.id,
        metadata: { from: existing[0]!.circle, to: invite.circle, consent: consent.version, via: 'their own yes' },
      });
    }
    if (isNew && invite.membershipId === null) {
      await tx.insert(memberships).values({
        familyId: invite.familyId,
        accountId: account.id,
        relationship: invite.relationship,
        circle: invite.circle,
        accessLevel: invite.accessLevel,
        seesOccasions: invite.shareOccasions,
        status: 'ACTIVE',
        isOwner: false,
        inviteId: invite.id,
        joinedAt: consentedAt,
        joinConsentVersion: consent.version,
        joinConsentedAt: consentedAt,
      });
      await tx.insert(auditRecords).values([
        { familyId: invite.familyId, actorAccountId: account.id, actorType: 'MEMBER', event: 'INVITE_ACCEPTED', targetType: 'invite', targetId: invite.id, metadata: { consent: consent.version, circle: invite.circle } },
        { familyId: invite.familyId, actorAccountId: account.id, actorType: 'MEMBER', event: 'MEMBERSHIP_CREATED', targetType: 'account', targetId: account.id },
      ]);
    }
    // any OTHER invite still waiting for this address is spent too — they're in now, and an old link
    // must never quietly change the level the parent has since set for them (04-B4). Logged.
    const spent = await tx
      .update(invites)
      .set({ status: 'REVOKED' })
      .where(and(eq(invites.familyId, invite.familyId), eq(invites.status, 'PENDING'), ne(invites.id, invite.id), sql`lower(${invites.email}) = ${invite.email.toLowerCase()}`))
      .returning({ id: invites.id });
    if (spent.length) {
      await tx.insert(auditRecords).values(
        spent.map((x) => ({ familyId: invite.familyId, actorAccountId: account.id, actorType: 'MEMBER' as const, event: 'INVITE_REVOKED' as const, targetType: 'invite', targetId: x.id, metadata: { reason: 'superseded', by: invite.id } })),
      );
    }
    // the name the parent gave them becomes their account name — unless they've already chosen one
    // of their own. An empty name or the email's first part is only the stand-in, and even that is
    // kept if they ever typed it themselves (their own name change is logged). Logged too.
    if (invite.inviteeName) {
      const [me] = await tx.select({ name: accounts.displayName, email: accounts.email }).from(accounts).where(eq(accounts.id, account.id));
      const [chose] = await tx
        .select({ id: auditRecords.id })
        .from(auditRecords)
        .where(and(eq(auditRecords.actorAccountId, account.id), eq(auditRecords.targetId, account.id), eq(auditRecords.event, 'PROFILE_UPDATED'), sql`${auditRecords.metadata}->>'field' = 'name'`, sql`coalesce(${auditRecords.metadata}->>'from', '') <> 'invite'`))
        .limit(1);
      if (me && !chose && isUnsetDisplayName(me.name, me.email)) {
        await tx.update(accounts).set({ displayName: invite.inviteeName, updatedAt: new Date() }).where(eq(accounts.id, account.id));
        await tx.insert(auditRecords).values({ familyId: invite.familyId, actorAccountId: account.id, actorType: 'MEMBER', event: 'PROFILE_UPDATED', targetType: 'account', targetId: account.id, metadata: { field: 'name', from: 'invite', inviteId: invite.id } });
      }
    }
    return { isNew: isNew && invite.membershipId === null }; // a move into the home isn't a new join (D27)
  });
  if (!joined) return { ok: false, reason: 'used' };
  if (joined.isNew) await tellParentTheyJoined(db, invite, account);
  return { ok: true, familyId: invite.familyId };
}

/**
 * "{name} joined your family" — to the family's controlling parent ONLY, never to other members.
 * Their name + the circle/access the parent chose, and a link to /family. A mail hiccup never undoes
 * the join (the membership is real either way); it's logged for ops.
 */
async function tellParentTheyJoined(db: DbHandle, invite: typeof invites.$inferSelect, joiner: { id: string; email: string }) {
  try {
    const [parent] = await db
      .select({ email: accounts.email, name: accounts.displayName })
      .from(families)
      .innerJoin(accounts, eq(accounts.id, families.ownerAccountId))
      .where(eq(families.id, invite.familyId));
    if (!parent) return;
    const [who] = await db.select({ name: accounts.displayName }).from(accounts).where(eq(accounts.id, joiner.id));
    await sendMail(
      memberJoinedEmail({
        to: parent.email,
        parentName: parent.name,
        joinerName: who?.name ?? null,
        joinerEmail: invite.email,
        relationship: invite.relationship,
        circle: invite.circle,
        accessLevel: invite.accessLevel,
      }),
    );
  } catch (e) {
    console.error('[invites] the "they joined" email to the parent failed', e instanceof Error ? e.message : e);
  }
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
