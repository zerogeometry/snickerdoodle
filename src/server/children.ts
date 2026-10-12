import { and, eq, sql } from 'drizzle-orm';
import { auditRecords, children } from '@/db/schema';
import { canManageFamily, type ViewerContext } from '@/authz';
import { screenChildFirstName } from '@/server/textSafety';
import type { DbHandle } from './db';

export interface ChildSubject {
  id: string;
  controllerAccountId: string;
  firstName: string;
}

/**
 * Find-or-create the child a keepsake is FOR, by FIRST NAME within a family. The
 * name is screened (first-name-only, no surname, no abuse) — an unusable or empty
 * name yields null (no subject). Matching is case-insensitive so "mia" and "Mia"
 * are the same little one.
 *
 * A newly-created child's controller is the calling parent: children are keepsake
 * SUBJECTS, never account holders (the parent-is-controller / no-self-join rule).
 */
export async function resolveChildSubject(
  db: DbHandle,
  familyId: string,
  accountId: string,
  rawFirstName: string | null | undefined,
): Promise<ChildSubject | null> {
  const screened = screenChildFirstName(rawFirstName);
  if (!screened.ok || !screened.value) return null;
  const firstName = screened.value;

  const [existing] = await db
    .select({ id: children.id, controllerAccountId: children.controllerAccountId, firstName: children.firstName })
    .from(children)
    .where(and(eq(children.familyId, familyId), sql`lower(${children.firstName}) = lower(${firstName})`));
  if (existing) return existing;

  const [created] = await db
    .insert(children)
    .values({ familyId, firstName, controllerAccountId: accountId })
    .returning({ id: children.id, controllerAccountId: children.controllerAccountId, firstName: children.firstName });
  return created!;
}

export type AddChildResult =
  | { ok: true; child: ChildSubject }
  | { ok: false; reason: 'not-owner' | 'surname' | 'invalid' | 'birthday' };

/**
 * A parent adds one of their little ones to the family as a keepsake SUBJECT (never an
 * account holder, never invited). Owner-only. First name only — a surname is refused
 * with a reason the UI can explain, never silently truncated. The birthday is optional
 * and used for nothing but the gentle "coming up" nudge (no profiling).
 */
export async function addChild(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; firstName: string; birthday?: string | null },
): Promise<AddChildResult> {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== input.familyId) {
    return { ok: false, reason: 'not-owner' };
  }
  const screened = screenChildFirstName(input.firstName);
  if (!screened.ok) return { ok: false, reason: screened.reason === 'surname' ? 'surname' : 'invalid' };
  if (!screened.value) return { ok: false, reason: 'invalid' };

  let birthday: string | null = null;
  if (input.birthday) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.birthday);
    const d = m ? new Date(`${input.birthday}T00:00:00Z`) : null;
    if (!d || Number.isNaN(d.getTime()) || d.getTime() > Date.now() || Number(m![1]) < 1990) return { ok: false, reason: 'birthday' };
    birthday = input.birthday;
  }

  const child = await resolveChildSubject(db, input.familyId, owner.accountId, screened.value);
  if (!child) return { ok: false, reason: 'invalid' };
  if (birthday) await db.update(children).set({ birthday }).where(eq(children.id, child.id));
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: owner.accountId,
    actorType: 'MEMBER',
    event: 'CHILD_ADDED',
    targetType: 'child',
    targetId: child.id,
  });
  return { ok: true, child };
}
