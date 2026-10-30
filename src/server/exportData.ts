import { and, eq, inArray } from 'drizzle-orm';
import {
  accountCredits,
  accounts,
  assets,
  children,
  consentRecords,
  families,
  giftLinks,
  invites,
  memberships,
  orderItems,
  orders,
  promoCodes,
  reminderSends,
  rightsRequests,
  savedDesigns,
} from '@/db/schema';
import type { DbHandle } from './db';
import { profileDataFor } from './profile';

/**
 * Everything we hold ABOUT one account, beyond what the Keepsake Home already shows (the
 * portable subject-access export). Scoped strictly to this account: their own rows, the families
 * they OWN (their little ones, invites, gift lists), and their own orders. Other people's data
 * appears only as far as it is part of the requester's own record (e.g. an invite they sent).
 * Image bytes are not inlined — keepsakes come through the authz-filtered home loader with
 * short-lived links, and every asset they control is listed here by id + dates.
 */
export async function collectAccountData(db: DbHandle, accountId: string) {
  const [account] = await db
    .select({ id: accounts.id, email: accounts.email, displayName: accounts.displayName, createdAt: accounts.createdAt, emailVerifiedAt: accounts.emailVerifiedAt })
    .from(accounts)
    .where(eq(accounts.id, accountId));

  const myMemberships = await db
    .select({
      familyId: memberships.familyId,
      familyName: families.displayName,
      relationship: memberships.relationship,
      circle: memberships.circle,
      accessLevel: memberships.accessLevel,
      seesFamilyCalendar: memberships.seesOccasions,
      status: memberships.status,
      isOwner: memberships.isOwner,
      joinedAt: memberships.joinedAt,
      endedAt: memberships.revokedAt,
    })
    .from(memberships)
    .innerJoin(families, eq(families.id, memberships.familyId))
    .where(eq(memberships.accountId, accountId));

  const ownedFamilyIds = (await db.select({ id: families.id }).from(families).where(eq(families.ownerAccountId, accountId))).map((f) => f.id);
  const inOwned = <T>(fn: (ids: string[]) => Promise<T[]>) => (ownedFamilyIds.length ? fn(ownedFamilyIds) : Promise.resolve([] as T[]));

  const littleOnes = await inOwned((ids) =>
    db.select({ id: children.id, firstName: children.firstName, birthday: children.birthday, addedAt: children.createdAt }).from(children).where(inArray(children.familyId, ids)),
  );
  const invitesSent = await inOwned((ids) =>
    db
      .select({ email: invites.email, relationship: invites.relationship, circle: invites.circle, accessLevel: invites.accessLevel, sharesFamilyCalendar: invites.shareOccasions, status: invites.status, sentAt: invites.createdAt, expiresAt: invites.expiresAt })
      .from(invites)
      .where(inArray(invites.familyId, ids)),
  );
  const giftLists = await inOwned((ids) =>
    db.select({ id: giftLinks.id, title: giftLinks.title, items: giftLinks.items, status: giftLinks.status, createdAt: giftLinks.createdAt, expiresAt: giftLinks.expiresAt }).from(giftLinks).where(inArray(giftLinks.familyId, ids)),
  );

  const keepsakesYouControl = await db
    .select({ id: assets.id, familyId: assets.familyId, kind: assets.kind, visibility: assets.visibility, keptInHome: assets.keptInHome, uploadedAt: assets.createdAt, fulfilledAt: assets.fulfilledAt, deleteAfter: assets.purgeAfter })
    .from(assets)
    .where(eq(assets.controllerAccountId, accountId));

  const saved = await db
    .select({ id: savedDesigns.id, assetId: savedDesigns.assetId, product: savedDesigns.variantSku, savedAt: savedDesigns.createdAt })
    .from(savedDesigns)
    .where(eq(savedDesigns.createdByAccountId, accountId));

  const orderRows = await db.select().from(orders).where(eq(orders.accountId, accountId));
  const lines = orderRows.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderRows.map((o) => o.id))) : [];
  const ordersOut = orderRows.map((o) => ({
    ref: o.ref,
    status: o.status,
    placedAt: o.createdAt,
    paidAt: o.paidAt,
    totalPence: o.totalPence,
    deliveryPence: o.deliveryPence,
    savings: { joinPence: o.joinSavingPence, familySetPence: o.familySetSavingPence, parcelPence: o.parcelSavingPence, multiBuyPence: o.multiBuySavingPence, codePence: o.promoSavingPence, creditPence: o.creditAppliedPence },
    isGift: o.isGift,
    giftSignedAs: o.giftFromName,
    giftNote: o.giftNote,
    buyerEmail: o.buyerEmail,
    shippingAddress: o.shippingAddress,
    tracking: o.tracking,
    items: lines.filter((l) => l.orderId === o.id).map((l) => ({ product: l.productKey, qty: l.qty, linePence: l.linePence })),
  }));

  const consents = await db
    .select({ channel: consentRecords.channel, purpose: consentRecords.purpose, status: consentRecords.status, basis: consentRecords.basis, source: consentRecords.source, at: consentRecords.createdAt })
    .from(consentRecords)
    .where(eq(consentRecords.accountId, accountId));
  const credits = await db
    .select({ pence: accountCredits.deltaPence, reason: accountCredits.reason, at: accountCredits.createdAt })
    .from(accountCredits)
    .where(eq(accountCredits.accountId, accountId));
  const referralCodes = await db
    .select({ code: promoCodes.code, active: promoCodes.active, createdAt: promoCodes.createdAt })
    .from(promoCodes)
    .where(eq(promoCodes.ownerAccountId, accountId));
  const birthdayNudgesSent = await db
    .select({ childId: reminderSends.childId, year: reminderSends.occasionYear, sentAt: reminderSends.sentAt })
    .from(reminderSends)
    .where(eq(reminderSends.accountId, accountId));
  const requests = await db
    .select({ type: rightsRequests.type, status: rightsRequests.status, receivedAt: rightsRequests.receivedAt, dueAt: rightsRequests.dueAt, completedAt: rightsRequests.completedAt, details: rightsRequests.details })
    .from(rightsRequests)
    .where(and(eq(rightsRequests.subjectAccountId, accountId)));

  const profile = await profileDataFor(db, accountId);

  return {
    account: account ?? null,
    profileImages: profile.images,
    familyMemberships: myMemberships,
    littleOnes,
    invitesSent,
    giftLists,
    keepsakesYouControl,
    savedForLater: saved,
    orders: ordersOut,
    consents,
    credits,
    referralCodes,
    birthdayNudgesSent,
    yourRequestsToUs: requests,
  };
}
