import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { birthdayView, type BirthdayView } from '@/lib/birthdayView';
import { canBuyFromGiftList, canDeleteAsset, canViewAsset, childParentOf, effectiveVisibility, originatorOf, visibilityChoicesFor, type AssetRef, type VisibilityRole } from '@/authz';
import { accounts, assets, children, families, invites, memberships, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { presignDownload } from '@/storage';
import type { Circle, VisibilityTier } from '@/domain/types';
import { listActiveFamilies, resolveHomeFamily, type FamilyChoice } from './onboarding';
import { resolveViewerContext } from './assets';
import { getCurrentAccount } from './session';
import { listGiftListsForOwner, type OwnerGiftList } from './giftLinks';
import { listSavedDesigns, type SavedDesignView } from './savedDesigns';
import { familyBannerFor, profileImagesFor } from './profile';
import { keepsakeThumbUrls } from './keepsakeThumbs';
import { keepsakeLooks } from './keepsakeCopy';
import { assetRefOf, isHeldForReport } from './assetRef';
import { memberName } from './memberName';

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
  /** Who sees it NOW (the adder's choice under the little one's parent's ceiling — D27). */
  visibility: VisibilityTier;
  /** The viewer's say over who sees it (D27): the adder picks up to `widest`; the child's parent may only narrow it,
   * up to the adder's own choice. null = the viewer can't change it. */
  visibilityRole: VisibilityRole | null;
  widestChoice: VisibilityTier | null;
  /** Who added it, when that isn't the viewer ("Granny added this"). */
  addedByName: string | null;
  /** On a little one's keepsake someone else added: the child's parent's name (so "only me" reads "just you and Sam"). */
  childParentName: string | null;
  /** The viewer may take it off (whoever added it, or the child's parent). */
  canDelete: boolean;
  createdAtISO: string;
  imageUrl: string | null;
  /** a small copy for the grid (the full picture is only for the open keepsake) */
  thumbUrl: string | null;
  childSubjectId: string | null;
  /** The viewer controls this keepsake (may change who sees it / delete it) — authz-derived. */
  canManage: boolean;
  /** An open report is holding it for review (only its parent sees it meanwhile). */
  held: boolean;
  /** Someone else's keepsake the viewer can see — they may report it (D8). */
  canReport: boolean;
}

export interface HomePendingInvite {
  id: string;
  email: string;
  circle: Circle;
}

export interface HomeChild {
  id: string;
  firstName: string;
  /** Day, month and the age they turn next, or null: only for the gentle "coming up" nudge. Never the
   * year (A-59): this goes to the browser, relatives included. */
  birthday: BirthdayView | null;
}

export interface HomeData {
  account: { id: string; email: string; name: string | null };
  familyId: string;
  familyName: string;
  /** The viewer owns (controls) this family — only owners invite, share gift links, add children. */
  isOwner: boolean;
  /** The viewer may order the family's keepsakes on products (VIEW_BUY / CONTRIBUTE; VIEW is look-only — 04-B2). */
  canBuy: boolean;
  /** Every family the viewer is in, for the switcher (length 1 = no switcher). */
  families: FamilyChoice[];
  members: HomeMember[];
  /** The family banner (members only, via the authz-gated image route). */
  bannerUrl: string | null;
  /** The viewer's "+ Keepsake" saved designs in this family. */
  savedDesigns: SavedDesignView[];
  /** The owner's gift lists with what's been bought + by whom (owner only; [] otherwise). */
  giftLists: OwnerGiftList[];
  /** Invites still waiting to be accepted — shown to the owner only. */
  pendingInvites: HomePendingInvite[];
  children: HomeChild[];
  keepsakes: HomeKeepsake[];
}

function refOf(row: typeof assets.$inferSelect): AssetRef {
  return assetRefOf(row);
}

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

  // the parent sees the addresses they invited; relatives never see each other's (04-B9)
  const viewerIsParent = memberRows.some(({ m, a }) => a.id === account.id && m.isOwner);
  const members: HomeMember[] = memberRows.map(({ m, a }) => {
    const name = memberName(a, m.relationship, { byThemself: a.id === account.id, byParent: viewerIsParent });
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
  const nameOf = (id: string | null) => (id ? (members.find((m) => m.accountId === id)?.name ?? null) : null);
  const visibilityFields = (ref: AssetRef) => {
    const choices = visibilityChoicesFor(ref, viewer);
    const adder = originatorOf(ref);
    const parent = childParentOf(ref);
    return {
      visibilityRole: choices?.role ?? null,
      widestChoice: choices?.widest ?? null,
      addedByName: adder && adder !== account.id ? nameOf(adder) : null,
      childParentName: parent && parent !== account.id ? nameOf(parent) : null,
    };
  };

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

  // each keepsake's LOOK (its Studio design if it has one — e.g. an edited copy), small for the grid
  const looks = await keepsakeLooks(db, visible.map((r) => ({ id: r.asset.id, studioDoc: r.asset.studioDoc })));
  const thumbs = await keepsakeThumbUrls(db, visible.map((r) => ({ assetId: r.asset.id, look: looks.get(r.asset.id) ?? null })), 300);
  const keepsakes: HomeKeepsake[] = await Promise.all(
    visible.map(async (r) => ({
      thumbUrl: thumbs.get(r.asset.id) ?? null,
      id: r.asset.id,
      visibility: effectiveVisibility(refOf(r.asset)),
      ...visibilityFields(refOf(r.asset)),
      canDelete: canDeleteAsset(refOf(r.asset), viewer),
      createdAtISO: r.asset.createdAt.toISOString(),
      imageUrl: looks.get(r.asset.id) ? await presignDownload(looks.get(r.asset.id)!.key, 300) : r.key ? await presignDownload(r.key, 300) : null,
      childSubjectId: r.asset.childSubjectId,
      canManage: visibilityChoicesFor(refOf(r.asset), viewer) !== null,
      held: isHeldForReport(r.asset),
      canReport: visibilityChoicesFor(refOf(r.asset), viewer) === null && r.asset.uploaderAccountId !== account.id,
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
          .where(and(eq(invites.familyId, familyId), eq(invites.status, 'PENDING'), gt(invites.expiresAt, new Date()), isNull(invites.membershipId)))
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
    canBuy: canBuyFromGiftList(viewer.membership),
    giftLists: isOwner ? await listGiftListsForOwner(db, viewer, familyId) : [],
    savedDesigns: await listSavedDesigns(db, account.id, familyId),
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
      birthday: isOwner || seesCalendar ? birthdayView(c.birthday ? String(c.birthday) : null, new Date()) : null,
    })),
    keepsakes,
  };
}
