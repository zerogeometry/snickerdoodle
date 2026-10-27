import { and, desc, eq, gt } from 'drizzle-orm';
import { canSetAssetVisibility, canViewAsset } from '@/authz';
import { accounts, assets, children, families, invites, memberships, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { presignDownload } from '@/storage';
import type { Circle, VisibilityTier } from '@/domain/types';
import { listActiveFamilies, resolveHomeFamily, type FamilyChoice } from './onboarding';
import { assetRefOf, resolveViewerContext } from './assets';
import { getCurrentAccount } from './session';
import { hasReminderConsent } from './reminders';
import { listGiftListsForOwner, type OwnerGiftList } from './giftLinks';
import { listSavedDesigns, type SavedDesignView } from './savedDesigns';
import { familyBannerFor, profileImagesFor } from './profile';

export interface HomeMember {
  accountId: string;
  name: string;
  initial: string;
  circle: Circle;
  isOwner: boolean;
  isYou: boolean;
  /** Sees the family calendar (birthdays). Only meaningful for non-owners. */
  seesOccasions: boolean;
  /** Their profile picture, if the viewer may see it (else the initial is shown). */
  avatarUrl: string | null;
}

export interface HomeKeepsake {
  id: string;
  visibility: VisibilityTier;
  createdAtISO: string;
  imageUrl: string | null;
  childSubjectId: string | null;
  /** The viewer controls this keepsake (may change who sees it / delete it) — authz-derived. */
  canManage: boolean;
  /** Someone reported it: it's hidden from relatives while it's checked. Only ever true for its
   * uploader/controller — nobody else is shown a held keepsake at all. */
  held: boolean;
}

export interface HomePendingInvite {
  id: string;
  email: string;
  circle: Circle;
}

export interface HomeChild {
  id: string;
  firstName: string;
  /** ISO date (YYYY-MM-DD) or null — only ever used for the gentle "coming up" nudge. */
  birthday: string | null;
}

export interface HomeData {
  account: { id: string; email: string; name: string | null };
  familyId: string;
  familyName: string;
  /** The viewer owns (controls) this family — only owners invite, share gift links, add children. */
  isOwner: boolean;
  /** Every family the viewer is in, for the switcher (length 1 = no switcher). */
  families: FamilyChoice[];
  members: HomeMember[];
  /** The family banner (members only, via the authz-gated image route). */
  bannerUrl: string | null;
  /** The viewer's current birthday-reminder email consent (PECR). */
  remindersOn: boolean;
  /** The viewer's "+ Keepsake" saved designs in this family. */
  savedDesigns: SavedDesignView[];
  /** The owner's gift lists with what's been bought + by whom (owner only; [] otherwise). */
  giftLists: OwnerGiftList[];
  /** Invites still waiting to be accepted — shown to the owner only. */
  pendingInvites: HomePendingInvite[];
  children: HomeChild[];
  keepsakes: HomeKeepsake[];
}

const refOf = assetRefOf;

/** Everything the keepsake home needs for the signed-in account — null for a guest. */
export async function loadHome(requestedFamilyId?: string | null): Promise<HomeData | null> {
  const account = await getCurrentAccount();
  if (!account) return null;

  const db = getDb();
  const familyId = await resolveHomeFamily(db, account.id, account.name, requestedFamilyId);
  const familyChoices = await listActiveFamilies(db, account.id);

  const [family] = await db.select().from(families).where(eq(families.id, familyId));

  const memberRows = await db
    .select({ m: memberships, a: accounts })
    .from(memberships)
    .innerJoin(accounts, eq(memberships.accountId, accounts.id))
    .where(and(eq(memberships.familyId, familyId), eq(memberships.status, 'ACTIVE')));

  const members: HomeMember[] = memberRows.map(({ m, a }) => {
    const name = a.displayName ?? a.email.split('@')[0] ?? 'Member';
    return {
      accountId: a.id,
      name,
      initial: name.charAt(0).toUpperCase(),
      circle: m.circle,
      isOwner: m.isOwner,
      isYou: a.id === account.id,
      seesOccasions: m.seesOccasions,
      avatarUrl: null,
    };
  });
  const pictures = await profileImagesFor(db, account.id, members.map((m) => m.accountId));
  for (const m of members) m.avatarUrl = pictures.get(m.accountId)?.avatarUrl ?? null;

  const viewer = await resolveViewerContext(db, account.id, familyId);

  // Kept keepsakes (the home is the keepsake box), newest first, with their
  // preserved ORIGINAL's key for thumbnailing. Filtered through authz.
  const rows = await db
    .select({ asset: assets, key: storageObjects.key })
    .from(assets)
    .leftJoin(
      storageObjects,
      and(eq(storageObjects.assetId, assets.id), eq(storageObjects.objectClass, 'ORIGINAL')),
    )
    .where(and(eq(assets.familyId, familyId), eq(assets.keptInHome, true)))
    .orderBy(desc(assets.createdAt));

  // Authz first, then never mint a URL for CSAM-blocked content (D8 runbook).
  // FLAGGED/PENDING stay visible to the family — the flag gates ordering, not viewing.
  const visible = rows.filter((r) => canViewAsset(refOf(r.asset), viewer).allowed && r.asset.moderationStatus !== 'BLOCKED');

  const keepsakes: HomeKeepsake[] = await Promise.all(
    visible.map(async (r) => ({
      id: r.asset.id,
      visibility: r.asset.visibility,
      createdAtISO: r.asset.createdAt.toISOString(),
      imageUrl: r.key ? await presignDownload(r.key, 300) : null,
      childSubjectId: r.asset.childSubjectId,
      canManage: canSetAssetVisibility(refOf(r.asset), viewer),
      held: refOf(r.asset).heldForReview,
    })),
  );

  // The family's children (keepsake subjects), so the home can file keepsakes into
  // each little one's corner.
  const childRows = await db
    .select({ id: children.id, firstName: children.firstName, birthday: children.birthday })
    .from(children)
    .where(eq(children.familyId, familyId));

  const isOwner = familyChoices.find((f) => f.familyId === familyId)?.isOwner ?? false;
  const seesCalendar = memberRows.some(({ m }) => m.accountId === account.id && m.seesOccasions);
  const pendingInvites: HomePendingInvite[] = isOwner
    ? (
        await db
          .select({ id: invites.id, email: invites.email, circle: invites.circle })
          .from(invites)
          .where(and(eq(invites.familyId, familyId), eq(invites.status, 'PENDING'), gt(invites.expiresAt, new Date())))
          .orderBy(desc(invites.createdAt))
      )
    : [];

  return {
    account,
    familyId,
    // The owner sees their family's own name (or the "Your family" placeholder they can
    // rename); a joined relative sees the name as they know it ("Sam's family").
    familyName: isOwner ? (family?.displayName ?? 'Your family') : (familyChoices.find((f) => f.familyId === familyId)?.name ?? 'the family'),
    isOwner,
    giftLists: isOwner ? await listGiftListsForOwner(db, viewer, familyId) : [],
    savedDesigns: await listSavedDesigns(db, account.id, familyId),
    remindersOn: await hasReminderConsent(db, account.id),
    families: familyChoices,
    members,
    bannerUrl: await familyBannerFor(db, account.id, familyId),
    pendingInvites,
    // A child's birthday is their personal data: the parent (owner) always sees it; a relative
    // only when the parent shared the family calendar with them (the pre-ticked invite choice,
    // changeable per member any time). Everyone else sees first names only.
    children: childRows.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      birthday: (isOwner || seesCalendar) && c.birthday ? String(c.birthday).slice(0, 10) : null,
    })),
    keepsakes,
  };
}
