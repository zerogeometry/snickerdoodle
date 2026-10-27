'use server';

import { getDb } from '@/db/client';
import { auditRecords, families } from '@/db/schema';
import { canManageFamily } from '@/authz';
import { eq } from 'drizzle-orm';
import { resolveViewerContext } from '@/server/assets';
import { addChild, deleteChild, updateChild } from '@/server/children';
import { leaveFamily, removeMember, revokeInvite, setMemberAccess } from '@/server/members';
import { revokeGiftLink } from '@/server/giftLinks';
import { revalidatePath } from 'next/cache';
import type { AccessLevel, Circle } from '@/domain/types';
import { setMemberSeesOccasions } from '@/server/invites';
import { ensureHomeFamily, listActiveFamilies } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import { containsAbusiveText } from '@/server/textSafety';
import { setReminderConsent } from '@/server/reminders';
import { addOccasion, deleteOccasion, setCelebrate, updateOccasion, type OccasionInput, type OccasionResult } from '@/server/occasions';
import { resendInvite } from '@/server/members';
import { appUrl, sendMail } from '@/server/mail';

/** The family the owner is managing: their OWNED family (only owners add children / rename). */
async function ownedFamily(accountId: string) {
  const db = getDb();
  const owned = (await listActiveFamilies(db, accountId)).find((f) => f.isOwner);
  if (!owned) return null;
  return { db, familyId: owned.familyId, viewer: await resolveViewerContext(db, accountId, owned.familyId) };
}

/** Add one of the parent's little ones (first name only; birthday optional). */
export async function addChildAction(input: { firstName: string; birthday?: string | null; birthdayLunar?: 'CHINESE' | 'KOREAN' | null }): Promise<{
  ok: boolean;
  needsAuth?: boolean;
  reason?: 'not-owner' | 'surname' | 'invalid' | 'birthday';
  firstName?: string;
}> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  const ctx = await ownedFamily(account.id);
  if (!ctx) return { ok: false, reason: 'not-owner' };
  const res = await addChild(ctx.db, ctx.viewer, { familyId: ctx.familyId, firstName: String(input.firstName ?? ''), birthday: input.birthday ?? null, birthdayLunar: input.birthdayLunar ?? null });
  return res.ok ? { ok: true, firstName: res.child.firstName } : { ok: false, reason: res.reason };
}

/** Rename the family (owner only). Screened; shown to invited relatives + on gift links. */
export async function renameFamilyAction(name: string): Promise<{ ok: boolean; reason?: 'invalid' | 'not-owner' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: 'not-owner' };
  const ctx = await ownedFamily(account.id);
  if (!ctx || !canManageFamily(ctx.viewer.membership)) return { ok: false, reason: 'not-owner' };
  const trimmed = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 40 || containsAbusiveText(trimmed)) return { ok: false, reason: 'invalid' };
  await ctx.db.update(families).set({ displayName: trimmed }).where(eq(families.id, ctx.familyId));
  await ctx.db.insert(auditRecords).values({
    familyId: ctx.familyId,
    actorAccountId: account.id,
    actorType: 'MEMBER',
    event: 'FAMILY_RENAMED',
    targetType: 'family',
    targetId: ctx.familyId,
  });
  return { ok: true };
}

/** One-tap opt in / out of birthday reminders by email (PECR consent, logged). */
export async function setReminderConsentAction(granted: boolean): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  await setReminderConsent(getDb(), account.id, granted === true, 'home:coming-up');
  return { ok: true };
}

/** The parent shares (or stops sharing) the family calendar with one member. */
export async function setMemberCalendarAction(memberAccountId: string, on: boolean): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const ctx = await ownedFamily(account.id);
  if (!ctx) return { ok: false };
  try {
    return await setMemberSeesOccasions(ctx.db, ctx.viewer, { familyId: ctx.familyId, memberAccountId: String(memberAccountId), on: on === true });
  } catch {
    return { ok: false };
  }
}

// ── Parent controls (owner-only; every check is server-side in src/server/members + children) ──

async function asOwner<T>(fn: (ctx: NonNullable<Awaited<ReturnType<typeof ownedFamily>>>, accountId: string) => Promise<T>, fallback: T): Promise<T> {
  const account = await getCurrentAccount();
  if (!account) return fallback;
  const ctx = await ownedFamily(account.id);
  if (!ctx) return fallback;
  try {
    const res = await fn(ctx, account.id);
    revalidatePath('/family');
    revalidatePath('/home');
    return res;
  } catch {
    return fallback;
  }
}

/** Remove a member from the family — they lose access at once and are signed out. */
export async function removeMemberAction(memberAccountId: string): Promise<{ ok: boolean }> {
  return asOwner((ctx) => removeMember(ctx.db, ctx.viewer, { familyId: ctx.familyId, memberAccountId: String(memberAccountId) }), { ok: false });
}

/** Change what a member sees (circle) and/or can do (access). */
export async function setMemberAccessAction(memberAccountId: string, change: { circle?: Circle; accessLevel?: AccessLevel }): Promise<{ ok: boolean }> {
  return asOwner(
    (ctx) =>
      setMemberAccess(ctx.db, ctx.viewer, {
        familyId: ctx.familyId,
        memberAccountId: String(memberAccountId),
        circle: change?.circle,
        accessLevel: change?.accessLevel,
      }),
    { ok: false },
  );
}

/** Cancel an invite that hasn't been accepted yet. */
export async function revokeInviteAction(inviteId: string): Promise<{ ok: boolean }> {
  return asOwner((ctx) => revokeInvite(ctx.db, ctx.viewer, { familyId: ctx.familyId, inviteId: String(inviteId) }), { ok: false });
}

/** Correct a little one's first name / birthday (null clears the birthday). */
export async function updateChildAction(
  childId: string,
  change: { firstName?: string; birthday?: string | null; birthdayLunar?: 'CHINESE' | 'KOREAN' | null },
): Promise<{ ok: boolean; reason?: 'not-owner' | 'surname' | 'invalid' | 'birthday' | 'taken' }> {
  return asOwner(
    (ctx) =>
      updateChild(ctx.db, ctx.viewer, {
        familyId: ctx.familyId,
        childId: String(childId),
        firstName: change?.firstName === undefined ? undefined : String(change.firstName),
        birthday: change?.birthday === undefined ? undefined : change.birthday ? String(change.birthday) : null,
        birthdayLunar: change?.birthdayLunar === undefined ? undefined : change.birthdayLunar,
      }),
    { ok: false, reason: 'not-owner' as const },
  );
}

/** Remove a little one; optionally delete every keepsake filed under them too. */
export async function deleteChildAction(childId: string, alsoDeleteKeepsakes: boolean): Promise<{ ok: boolean; keepsakesDeleted: number }> {
  return asOwner(
    (ctx) => deleteChild(ctx.db, ctx.viewer, { familyId: ctx.familyId, childId: String(childId), alsoDeleteKeepsakes: alsoDeleteKeepsakes === true }),
    { ok: false, keepsakesDeleted: 0 },
  );
}

/** Turn a gift link off — the link stops working for everyone at once. */
export async function revokeGiftLinkAction(giftLinkId: string): Promise<{ ok: boolean }> {
  return asOwner((ctx) => revokeGiftLink(ctx.db, ctx.viewer, String(giftLinkId)), { ok: false });
}

/** A member leaves a family they were invited into (never their own). */
export async function leaveFamilyAction(familyId: string): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const db = getDb();
  const viewer = await resolveViewerContext(db, account.id, String(familyId));
  const res = await leaveFamily(db, viewer, { familyId: String(familyId) });
  revalidatePath('/home');
  return res;
}

// ── the family calendar (founder, 27 Oct) ─────────────────────────────────────────────────────

/** Add an occasion to the signed-in parent's family calendar (owner or a contributor). */
export async function addOccasionAction(input: OccasionInput): Promise<OccasionResult> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: 'not-allowed' };
  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  return addOccasion(db, account.id, familyId, input);
}

/** Change an occasion (its owner, or whoever added it). */
export async function updateOccasionAction(occasionId: string, input: OccasionInput): Promise<OccasionResult> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: 'not-allowed' };
  return updateOccasion(getDb(), account.id, String(occasionId), input);
}

/** Remove an occasion (its owner, or whoever added it). */
export async function deleteOccasionAction(occasionId: string): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  return { ok: await deleteOccasion(getDb(), account.id, String(occasionId)) };
}

/** The days we celebrate (owner only). */
export async function setCelebrateAction(groups: string[]): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  return { ok: await setCelebrate(db, account.id, familyId, groups) };
}

/** Send a pending invite again — a fresh link and a fresh fortnight (the old link stops working). */
export async function resendInviteAction(inviteId: string): Promise<{ ok: boolean }> {
  return asOwner(async (ctx) => {
    const res = await resendInvite(ctx.db, ctx.viewer, { familyId: ctx.familyId, inviteId: String(inviteId) });
    if (!res.ok) return { ok: false };
    await sendMail({
      kind: 'family-invite',
      to: res.email,
      subject: 'a little reminder: you’re invited to a family keepsake box',
      text:
        `You've been invited to join a family's private keepsake box on snickerdoodle.\n\n` +
        `Tap to join (it's just for you, and lasts 14 days):\n${appUrl(`/join/${res.token}`)}\n\n` +
        `Nothing is ever public — only the family you join can see what's inside.`,
    });
    return { ok: true };
  }, { ok: false });
}
