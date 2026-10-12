'use server';

import { getDb } from '@/db/client';
import { auditRecords, families } from '@/db/schema';
import { canManageFamily } from '@/authz';
import { eq } from 'drizzle-orm';
import { resolveViewerContext } from '@/server/assets';
import { addChild } from '@/server/children';
import { setMemberSeesOccasions } from '@/server/invites';
import { listActiveFamilies } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import { containsAbusiveText } from '@/server/textSafety';
import { setReminderConsent } from '@/server/reminders';

/** The family the owner is managing: their OWNED family (only owners add children / rename). */
async function ownedFamily(accountId: string) {
  const db = getDb();
  const owned = (await listActiveFamilies(db, accountId)).find((f) => f.isOwner);
  if (!owned) return null;
  return { db, familyId: owned.familyId, viewer: await resolveViewerContext(db, accountId, owned.familyId) };
}

/** Add one of the parent's little ones (first name only; birthday optional). */
export async function addChildAction(input: { firstName: string; birthday?: string | null }): Promise<{
  ok: boolean;
  needsAuth?: boolean;
  reason?: 'not-owner' | 'surname' | 'invalid' | 'birthday';
  firstName?: string;
}> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  const ctx = await ownedFamily(account.id);
  if (!ctx) return { ok: false, reason: 'not-owner' };
  const res = await addChild(ctx.db, ctx.viewer, { familyId: ctx.familyId, firstName: String(input.firstName ?? ''), birthday: input.birthday ?? null });
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
