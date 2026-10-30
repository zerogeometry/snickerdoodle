import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { accounts, assets, children, families, invites, memberships } from '@/db/schema';
import { canAddOccasion, canSeeFamilyCalendar, canSetCelebrate, canViewAsset } from '@/authz';
import { cleanCelebrate } from '@/lib/occasions/catalogue';
import { assetRefOf } from './assetRef';
import { keepsakeLooks } from './keepsakeCopy';
import { keepsakeThumbUrls } from './keepsakeThumbs';
import { loadCalendar, occasionsFor, type CalendarEvent } from './occasions';
import { addDays } from './occasions/dates';
import { hasReminderConsent } from './reminders';
import { resolveViewerContext } from './assets';
import { getDb } from '@/db/client';
import type { AccessLevel, Circle, Relationship } from '@/domain/types';
import { ensureHomeFamily } from './onboarding';
import { getCurrentAccount } from './session';
import { familyBannerFor, profileImagesFor } from './profile';
import { memberName } from './memberName';

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
  relationship: Relationship;
}

export interface FamilyPendingInvite {
  id: string;
  email: string;
  circle: Circle;
  relationship: Relationship;
  expiresAtISO: string;
}

export interface FamilyChild {
  id: string;
  firstName: string;
  birthdayISO: string | null;
  birthdayLunar: 'CHINESE' | 'KOREAN' | null;
}

/** Another family the viewer belongs to ("my families", founder 27 Oct). */
export interface OtherFamily {
  familyId: string;
  name: string;
  bannerUrl: string | null;
  relationship: Relationship;
  circle: Circle;
  /** keepsakes in it the viewer can see */
  keepsakes: number;
  seesCalendar: boolean;
}

export interface FamilyOccasion {
  id: string;
  title: string;
  kind: 'BIRTHDAY' | 'ANNIVERSARY' | 'MILESTONE' | 'OTHER';
  date: string;
  lunar: 'CHINESE' | 'KOREAN' | null;
  childId: string | null;
  memberAccountId: string | null;
  shareCircle: Circle;
  canChange: boolean;
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
  stats: { people: number; generations: number; keepsakes: number; occasions: number };
  /** the calendar: this family's dates + festivals, and the occasions other families share with the viewer */
  calendar: CalendarEvent[];
  /** the first day the calendar covers (the 1st of this month) and the last */
  calendarFrom: string;
  calendarTo: string;
  occasions: FamilyOccasion[];
  /** the days we celebrate (festival group ids) */
  celebrate: string[];
  viewer: { accountId: string; canAddOccasion: boolean; canSetCelebrate: boolean; seesCalendar: boolean; remindersOn: boolean };
  myFamilies: OtherFamily[];
  /** the newest keepsakes the viewer can see here, small */
  recentlyKept: { id: string; thumbUrl: string | null }[];
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

  // the parent sees the addresses they invited; relatives never see each other's (04-B9)
  const viewerIsParent = memberRows.some(({ m, a }) => a.id === account.id && m.isOwner);
  const members: FamilyMember[] = memberRows.map(({ m, a }) => {
    const name = memberName(a, m.relationship, { byThemself: a.id === account.id, byParent: viewerIsParent });
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
      relationship: m.relationship,
    };
  });
  const pictures = await profileImagesFor(db, account.id, members.map((m) => m.accountId));
  for (const m of members) m.avatarUrl = pictures.get(m.accountId)?.avatarUrl ?? null;

  const kidRows = await db
    .select({ id: children.id, firstName: children.firstName, birthday: children.birthday, birthdayLunar: children.birthdayLunar })
    .from(children)
    .where(eq(children.familyId, familyId));
  const childList: FamilyChild[] = kidRows.map((k) => ({
    id: k.id,
    firstName: k.firstName,
    birthdayISO: k.birthday ? String(k.birthday) : null,
    birthdayLunar: k.birthdayLunar ?? null,
  }));

  const viewerIsOwner = members.some((m) => m.isYou && m.isOwner);
  const pendingInvites: FamilyPendingInvite[] = viewerIsOwner
    ? await db
        .select({ id: invites.id, email: invites.email, circle: invites.circle, relationship: invites.relationship, expiresAt: invites.expiresAt })
        .from(invites)
        .where(and(eq(invites.familyId, familyId), eq(invites.status, 'PENDING'), gt(invites.expiresAt, new Date())))
        .orderBy(desc(invites.createdAt))
        .then((rows) => rows.map(({ expiresAt, ...i }) => ({ ...i, expiresAtISO: expiresAt.toISOString() })))
    : [];

  const bannerUrl = await familyBannerFor(db, account.id, familyId);

  // ── the viewer, and what they may do with the calendar ──
  const me = memberRows.find(({ m }) => m.accountId === account.id)?.m;
  const cm = me ? { familyId, accountId: me.accountId, circle: me.circle, accessLevel: me.accessLevel, status: me.status, isOwner: me.isOwner, seesOccasions: me.seesOccasions } : null;
  const today = new Date().toISOString().slice(0, 10);
  const calendarFrom = `${today.slice(0, 7)}-01`;
  const calendarTo = addDays(`${String(Number(today.slice(0, 4)) + 1)}-${today.slice(5, 7)}-01`, -1);
  const calendar = await loadCalendar(db, account.id, familyId, calendarFrom, calendarTo);
  const occasionRows = (await occasionsFor(db, account.id, familyId)) as FamilyOccasion[];

  // ── keepsakes the viewer can see here: the count, and the newest few, small ──
  const kept = await db.select().from(assets).where(and(eq(assets.familyId, familyId), eq(assets.keptInHome, true))).orderBy(desc(assets.createdAt));
  const viewer = await resolveViewerContext(db, account.id, familyId);
  const visible = kept.filter((a) => a.moderationStatus !== 'BLOCKED' && canViewAsset(assetRefOf(a), viewer).allowed);
  const newest = visible.slice(0, 6);
  const looks = await keepsakeLooks(db, newest.map((a) => ({ id: a.id, studioDoc: a.studioDoc })));
  const thumbs = await keepsakeThumbUrls(db, newest.map((a) => ({ assetId: a.id, look: looks.get(a.id) ?? null })), 300);

  // ── generations: the little ones; the parents' generation; the grandparents' ──
  const rel = new Set(members.map((m) => m.relationship));
  const generations =
    (childList.length ? 1 : 0) + (members.some((m) => m.isOwner || m.relationship === 'PARENT' || m.relationship === 'AUNT_UNCLE') ? 1 : 0) + (rel.has('GRANDPARENT') ? 1 : 0);

  // ── my families: the other families the viewer belongs to ──
  const others = await db
    .select({ m: memberships, f: families })
    .from(memberships)
    .innerJoin(families, eq(families.id, memberships.familyId))
    .where(and(eq(memberships.accountId, account.id), eq(memberships.status, 'ACTIVE')));
  const otherRows = others.filter(({ f }) => f.id !== familyId);
  const otherKept = otherRows.length
    ? await db.select().from(assets).where(and(inArray(assets.familyId, otherRows.map(({ f }) => f.id)), eq(assets.keptInHome, true)))
    : [];
  const myFamilies: OtherFamily[] = [];
  for (const { m, f } of otherRows) {
    const v = await resolveViewerContext(db, account.id, f.id);
    myFamilies.push({
      familyId: f.id,
      name: f.displayName,
      bannerUrl: await familyBannerFor(db, account.id, f.id),
      relationship: m.relationship,
      circle: m.circle,
      keepsakes: otherKept.filter((a) => a.familyId === f.id && a.moderationStatus !== 'BLOCKED' && canViewAsset(assetRefOf(a), v).allowed).length,
      seesCalendar: canSeeFamilyCalendar({ familyId: f.id, accountId: m.accountId, circle: m.circle, accessLevel: m.accessLevel, status: m.status, isOwner: m.isOwner, seesOccasions: m.seesOccasions }, f.id),
    });
  }

  const ownOccasions = calendar.filter((e) => e.own && e.kind !== 'festival' && e.kind !== 'shop');
  return {
    familyId,
    familyName: family?.displayName ?? 'Your family',
    members,
    children: childList,
    viewerIsOwner,
    pendingInvites,
    bannerUrl,
    stats: { people: members.length + childList.length, generations: Math.max(1, generations), keepsakes: visible.length, occasions: new Set(ownOccasions.map((e) => e.key)).size },
    calendar,
    calendarFrom,
    calendarTo,
    occasions: occasionRows,
    celebrate: cleanCelebrate(family?.celebrate),
    viewer: {
      accountId: account.id,
      canAddOccasion: canAddOccasion(cm, familyId),
      canSetCelebrate: canSetCelebrate(cm, familyId),
      seesCalendar: canSeeFamilyCalendar(cm, familyId),
      remindersOn: await hasReminderConsent(db, account.id),
    },
    myFamilies,
    recentlyKept: newest.map((a) => ({ id: a.id, thumbUrl: thumbs.get(a.id) ?? null })),
  };
}
