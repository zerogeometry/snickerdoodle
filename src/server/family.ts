import { and, eq } from 'drizzle-orm';
import { accounts, children, families, memberships } from '@/db/schema';
import { getDb } from '@/db/client';
import type { AccessLevel, Circle } from '@/domain/types';
import { ensureHomeFamily } from './onboarding';
import { getCurrentAccount } from './session';

export interface FamilyMember {
  accountId: string;
  name: string;
  initial: string;
  circle: Circle;
  accessLevel: AccessLevel;
  isOwner: boolean;
  isYou: boolean;
}

export interface FamilyChild {
  id: string;
  firstName: string;
  birthdayISO: string | null;
}

export interface FamilyData {
  familyId: string;
  familyName: string;
  members: FamilyMember[];
  children: FamilyChild[];
}

/** The real family circle + keepsake subjects for the signed-in account (null for a guest). */
export async function loadFamily(): Promise<FamilyData | null> {
  const account = await getCurrentAccount();
  if (!account) return null;

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const [family] = await db.select().from(families).where(eq(families.id, familyId));

  const memberRows = await db
    .select({ m: memberships, a: accounts })
    .from(memberships)
    .innerJoin(accounts, eq(memberships.accountId, accounts.id))
    .where(and(eq(memberships.familyId, familyId), eq(memberships.status, 'ACTIVE')));

  const members: FamilyMember[] = memberRows.map(({ m, a }) => {
    const name = a.displayName ?? a.email.split('@')[0] ?? 'Member';
    return {
      accountId: a.id,
      name,
      initial: name.charAt(0).toUpperCase(),
      circle: m.circle,
      accessLevel: m.accessLevel,
      isOwner: m.isOwner,
      isYou: a.id === account.id,
    };
  });

  const kidRows = await db
    .select({ id: children.id, firstName: children.firstName, birthday: children.birthday })
    .from(children)
    .where(eq(children.familyId, familyId));
  const childList: FamilyChild[] = kidRows.map((k) => ({
    id: k.id,
    firstName: k.firstName,
    birthdayISO: k.birthday ? String(k.birthday) : null,
  }));

  return { familyId, familyName: family?.displayName ?? 'Your family', members, children: childList };
}
