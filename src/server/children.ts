import { and, eq, ne, sql } from 'drizzle-orm';
import { assets, auditRecords, children } from '@/db/schema';
import { canManageFamily, type ViewerContext } from '@/authz';
import { screenChildFirstName } from '@/server/textSafety';
import { deleteAsset } from './assets';
import { recordErasure } from './erasureLedger';
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

  const birthday = parseBirthday(input.birthday);
  if (birthday === false) return { ok: false, reason: 'birthday' };

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

/** A YYYY-MM-DD birthday in a sane range → the string; absent → null; nonsense → false. */
function parseBirthday(raw: string | null | undefined): string | null | false {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = m ? new Date(`${raw}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || d.getTime() > Date.now() || Number(m![1]) < 1990) return false;
  return raw;
}

async function ownedChild(db: DbHandle, owner: ViewerContext, familyId: string, childId: string) {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== familyId) return null;
  const [row] = await db.select().from(children).where(and(eq(children.id, childId), eq(children.familyId, familyId)));
  return row ?? null;
}

export type UpdateChildResult = { ok: true } | { ok: false; reason: 'not-owner' | 'surname' | 'invalid' | 'birthday' | 'taken' };

/**
 * The parent corrects a little one's first name and/or birthday (owner-only, same screening as
 * adding: first name only, no surname). `birthday: null` clears it; undefined leaves it alone.
 */
export async function updateChild(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; childId: string; firstName?: string; birthday?: string | null },
): Promise<UpdateChildResult> {
  const child = await ownedChild(db, owner, input.familyId, input.childId);
  if (!child) return { ok: false, reason: 'not-owner' };
  const patch: { firstName?: string; birthday?: string | null } = {};
  if (input.firstName !== undefined) {
    const screened = screenChildFirstName(input.firstName);
    if (!screened.ok) return { ok: false, reason: screened.reason === 'surname' ? 'surname' : 'invalid' };
    if (!screened.value) return { ok: false, reason: 'invalid' };
    const [clash] = await db
      .select({ id: children.id })
      .from(children)
      .where(and(eq(children.familyId, input.familyId), ne(children.id, child.id), sql`lower(${children.firstName}) = lower(${screened.value})`));
    if (clash) return { ok: false, reason: 'taken' };
    patch.firstName = screened.value;
  }
  if (input.birthday !== undefined) {
    const b = parseBirthday(input.birthday);
    if (b === false) return { ok: false, reason: 'birthday' };
    patch.birthday = b;
  }
  if (Object.keys(patch).length === 0) return { ok: true };
  await db.update(children).set(patch).where(eq(children.id, child.id));
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: owner.accountId,
    actorType: 'MEMBER',
    event: 'CHILD_UPDATED',
    targetType: 'child',
    targetId: child.id,
    // which fields changed — never the values (no child data in the audit trail)
    metadata: { fields: Object.keys(patch) },
  });
  return { ok: true };
}

/**
 * Remove a little one from the family (owner-only). With `alsoDeleteKeepsakes`, every keepsake
 * filed under them is really deleted through the cascading deleteAsset (bytes + rows + audit);
 * otherwise their keepsakes stay in the family box, just no longer filed under a name. Their
 * reminder history cascades with the child row.
 */
export async function deleteChild(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; childId: string; alsoDeleteKeepsakes: boolean },
): Promise<{ ok: boolean; keepsakesDeleted: number }> {
  const child = await ownedChild(db, owner, input.familyId, input.childId);
  if (!child) return { ok: false, keepsakesDeleted: 0 };

  const filed = await db.select({ id: assets.id }).from(assets).where(eq(assets.childSubjectId, child.id));
  let keepsakesDeleted = 0;
  if (input.alsoDeleteKeepsakes) {
    for (const a of filed) {
      await deleteAsset(db, a.id, owner); // throws if not deletable — nothing is half-done silently
      keepsakesDeleted++;
    }
  } else if (filed.length) {
    await db.update(assets).set({ childSubjectId: null }).where(eq(assets.childSubjectId, child.id));
  }
  await db.update(children).set({ avatarAssetId: null }).where(eq(children.id, child.id));
  await db.delete(children).where(eq(children.id, child.id));
  await recordErasure({ kind: 'child', id: child.id });
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: owner.accountId,
    actorType: 'MEMBER',
    event: 'CHILD_DELETED',
    targetType: 'child',
    targetId: child.id,
    metadata: { keepsakesDeleted, keepsakesUnfiled: input.alsoDeleteKeepsakes ? 0 : filed.length },
  });
  return { ok: true, keepsakesDeleted };
}
