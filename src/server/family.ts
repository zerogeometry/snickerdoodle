import { and, desc, eq, gt } from 'drizzle-orm';
import { accounts, children, families, invites, memberships } from '@/db/schema';
import { getDb } from '@/db/client';
import type { AccessLevel, Circle } from '@/domain/types';
import { ensureHomeFamily } from './onboarding';
import { getCurrentAccount } from './session';
import { familyBannerFor, profileImagesFor } from './profile';

export interface FamilyMember {
  accountId: string;
  name: string;
  initial: string;
  circle: Circle;
  accessLevel: AccessLevel;
  isOwner: boolean;
  isYou: boolean;
  seesOccasions: boolean;
  avatarUrl: string | null;
}

export interface FamilyPendingInvite {
  id: string;
  email: string;
  circle: Circle;
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
  /** The signed-in account owns this family (and so sees the parent controls). */
  viewerIsOwner: boolean;
  /** The family banner, if set (members only, via the authz-gated image route). */
  bannerUrl: string | null;
  /** Invites still waiting to be accepted — owner only. */
  pendingInvites: FamilyPendingInvite[];
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
      seesOccasions: m.seesOccasions,
      avatarUrl: null as string | null,
    };
  });
  const pictures = await profileImagesFor(db, account.id, members.map((m) => m.accountId));
  for (const m of members) m.avatarUrl = pictures.get(m.accountId)?.avatarUrl ?? null;

  const kidRows = await db
    .select({ id: children.id, firstName: children.firstName, birthday: children.birthday })
    .from(children)
    .where(eq(children.familyId, familyId));
  const childList: FamilyChild[] = kidRows.map((k) => ({
    id: k.id,
    firstName: k.firstName,
    birthdayISO: k.birthday ? String(k.birthday) : null,
  }));

  const viewerIsOwner = members.some((m) => m.isYou && m.isOwner);
  const pendingInvites: FamilyPendingInvite[] = viewerIsOwner
    ? await db
        .select({ id: invites.id, email: invites.email, circle: invites.circle })
        .from(invites)
        .where(and(eq(invites.familyId, familyId), eq(invites.status, 'PENDING'), gt(invites.expiresAt, new Date())))
        .orderBy(desc(invites.createdAt))
    : [];

  const bannerUrl = await familyBannerFor(db, account.id, familyId);
  return { familyId, familyName: family?.displayName ?? 'Your family', members, children: childList, viewerIsOwner, pendingInvites, bannerUrl };
}
