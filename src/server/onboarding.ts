import { and, eq, ne } from 'drizzle-orm';
import { accounts, assets, children, families, memberships } from '@/db/schema';
import type { DbHandle } from './db';

/**
 * Every account is the controller of its own family workspace. On first use we
 * create it and make the account the owner (an ACTIVE, CONTRIBUTE, Family-circle
 * membership). Idempotent: returns the existing family if there already is one.
 *
 * This is the "parent is controller / no self-join" model — the owner's
 * membership is the only one created without an invite (the schema CHECK allows
 * it precisely for owners).
 */
/** The placeholder a family carries until its parent names it. */
export const DEFAULT_FAMILY_NAME = 'Your family';

/** A family's name as shown to RELATIVES (gift links, invites): "Your family" reads wrong
 * from their side, so an unnamed family is shown as null and the page uses neutral words. */
export function familyNameForRelatives(name: string | null | undefined): string | null {
  const n = name?.trim();
  return n && n !== DEFAULT_FAMILY_NAME ? n : null;
}

export async function ensureHomeFamily(
  db: DbHandle,
  accountId: string,
  displayName: string | null,
): Promise<string> {
  const existing = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(and(eq(memberships.accountId, accountId), eq(memberships.isOwner, true), eq(memberships.status, 'ACTIVE')));
  if (existing[0]) return existing[0].familyId;

  const name = displayName?.trim() ? `${displayName.trim()}'s family` : DEFAULT_FAMILY_NAME;
  const [family] = await db.insert(families).values({ displayName: name, ownerAccountId: accountId }).returning();
  await db.insert(memberships).values({
    familyId: family!.id,
    accountId,
    relationship: 'PARENT',
    circle: 'FAMILY',
    accessLevel: 'CONTRIBUTE',
    status: 'ACTIVE',
    isOwner: true,
  });
  return family!.id;
}

export interface FamilyChoice {
  familyId: string;
  /** What the viewer calls it: the family's own name, else "my keepsakes" (owned) or
   * "<owner>'s family" (joined) — never two indistinguishable "Your family" entries. */
  name: string;
  isOwner: boolean;
}

/** Every family the account holds an ACTIVE membership in (owned first, then joined, newest first). */
export async function listActiveFamilies(db: DbHandle, accountId: string): Promise<FamilyChoice[]> {
  const rows = await db
    .select({
      familyId: memberships.familyId,
      isOwner: memberships.isOwner,
      name: families.displayName,
      joinedAt: memberships.joinedAt,
      ownerName: accounts.displayName,
    })
    .from(memberships)
    .innerJoin(families, eq(families.id, memberships.familyId))
    .leftJoin(accounts, eq(accounts.id, families.ownerAccountId))
    .where(and(eq(memberships.accountId, accountId), eq(memberships.status, 'ACTIVE')));
  return rows
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || (b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0))
    .map((r) => {
      const named = familyNameForRelatives(r.name);
      // a relative sees the parent's first name, never their email handle (04-B9)
      const owner = r.ownerName?.trim().split(/\s+/)[0];
      return { familyId: r.familyId, name: named ?? (r.isOwner ? 'my keepsakes' : owner ? `${owner}'s family` : 'a family you joined'), isOwner: r.isOwner };
    });
}

/**
 * Which family the keepsake home shows. A relative who JOINED a family must land in
 * it — never in an empty box of their own that was created just by visiting. Order:
 *  1. an explicitly requested family the account is an ACTIVE member of (the switcher);
 *  2. the account's own family, if it has anything in it (keepsakes, children, members);
 *  3. the most recently joined family;
 *  4. otherwise their own family (created on first use, as before).
 * Membership is re-checked here; authz still filters everything shown inside it.
 */
export async function resolveHomeFamily(
  db: DbHandle,
  accountId: string,
  displayName: string | null,
  requestedFamilyId?: string | null,
): Promise<string> {
  const all = await listActiveFamilies(db, accountId);
  if (requestedFamilyId && all.some((f) => f.familyId === requestedFamilyId)) return requestedFamilyId;

  const owned = all.find((f) => f.isOwner);
  const joined = all.find((f) => !f.isOwner);
  if (owned && (!joined || (await familyHasContent(db, owned.familyId, accountId)))) return owned.familyId;
  if (joined) return joined.familyId;
  return ensureHomeFamily(db, accountId, displayName);
}

async function familyHasContent(db: DbHandle, familyId: string, ownerAccountId: string): Promise<boolean> {
  const [kept] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.familyId, familyId), eq(assets.keptInHome, true))).limit(1);
  if (kept) return true;
  const [child] = await db.select({ id: children.id }).from(children).where(eq(children.familyId, familyId)).limit(1);
  if (child) return true;
  const [other] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.familyId, familyId), eq(memberships.status, 'ACTIVE'), ne(memberships.accountId, ownerAccountId)))
    .limit(1);
  return !!other;
}
