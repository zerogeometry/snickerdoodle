import { and, eq, inArray } from 'drizzle-orm';
import {
  accountCredits,
  accounts,
  assets,
  auditRecords,
  children,
  consentRecords,
  families,
  giftLinks,
  invites,
  memberships,
  orders,
  profileImages,
  promoCodes,
  reminderSends,
  savedDesigns,
  sessions,
} from '@/db/schema';
import { eraseAsset } from './assets';
import { deleteObject } from '@/storage';
import { giftNoteInsertKey } from '@/fulfillment/giftNoteInsertKey';
import { appUrl, sendMail } from './mail';
import { recordErasure } from './erasureLedger';
import { eraseProfileImage } from './profile';
import type { DbHandle } from './db';

/** Orders still being made — closing waits for these (their source art is needed to print). */
const IN_FLIGHT = ['PAID', 'FULFILLING'] as const;

export type CloseAccountResult =
  | { ok: true; keepsakesDeleted: number; familiesClosed: number }
  | { ok: false; reason: 'order-in-flight' | 'not-found' | 'bad-handover' };

/**
 * Close an account for real (right to erasure; children's data deletable on demand).
 *
 * - Every family the account OWNS is closed: all its keepsakes are erased (bytes confirmed gone,
 *   then rows — via eraseAsset), and its little ones, invites, gift links, saved designs and
 *   memberships go with it. Everyone else loses access at once (no membership left to honour).
 * - In families they were invited into: their membership ends and anything they CONTROL there is
 *   erased (a child's art is controlled by that child's parent, so it stays with that family).
 * - Account-level data goes: sessions, saved designs, credits, reminder history, consent records;
 *   their referral code is switched off.
 * - Orders stay for the accounts (a legal record) but lose the personal bits: buyer email,
 *   shipping address and gift signature. In-flight orders (PAID/FULFILLING) block closing until
 *   they ship — the art is still needed to print them.
 * - The account row itself is ANONYMISED, not deleted (orders and order artwork reference it):
 *   email → an unroutable placeholder, name/password/MFA cleared. It can never sign in again.
 * - Append-only audit rows (ids only, no content) remain as the accountability trail.
 *
 * Backups: originals are crypto-shredded / excluded from long-lived backups at the infra layer;
 * the print provider's copies are covered by their own retention + a deletion request (ops).
 */
export async function closeAccount(
  db: DbHandle,
  accountId: string,
  now = new Date(),
  opts: { handOver?: { familyId: string; newOwnerAccountId: string } | null; skipLedger?: boolean } = {},
): Promise<CloseAccountResult> {
  const ledger = { skipLedger: opts.skipLedger === true };
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId));
  if (!account) return { ok: false, reason: 'not-found' };

  const inFlight = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.accountId, accountId), inArray(orders.status, IN_FLIGHT)));
  if (inFlight.length > 0) return { ok: false, reason: 'order-in-flight' };

  let keepsakesDeleted = 0;
  const actor = { accountId, actorType: 'MEMBER' as const };

  // ── 0. Optional: hand one owned family to another member, so it carries on ──────
  let handedOver: string | null = null;
  if (opts.handOver) {
    const res = await handOverFamily(db, accountId, opts.handOver, now, ledger);
    if (!res.ok) return { ok: false, reason: 'bad-handover' };
    keepsakesDeleted += res.privateErased;
    handedOver = opts.handOver.familyId;
  }

  // ── 1. Families they own: close them entirely ────────────────────────────────
  const owned = (await db.select({ id: families.id }).from(families).where(eq(families.ownerAccountId, accountId))).filter((f) => f.id !== handedOver);
  for (const { id: familyId } of owned) {
    await db.update(children).set({ avatarAssetId: null }).where(eq(children.familyId, familyId)); // unpin before erasing
    const rows = await db.select({ id: assets.id, familyId: assets.familyId }).from(assets).where(eq(assets.familyId, familyId));
    for (const row of rows) {
      await eraseAsset(db, row, actor, { reason: 'account-closed' }, ledger);
      keepsakesDeleted++;
    }
    const [banner] = await db.select().from(profileImages).where(and(eq(profileImages.familyId, familyId), eq(profileImages.kind, 'FAMILY_BANNER')));
    if (banner) await eraseProfileImage(db, banner, ledger);
    await db.delete(savedDesigns).where(eq(savedDesigns.familyId, familyId));
    await db.delete(memberships).where(eq(memberships.familyId, familyId)); // everyone loses access now
    await db.delete(giftLinks).where(eq(giftLinks.familyId, familyId)); // orders keep history (FK set null)
    await db.delete(invites).where(eq(invites.familyId, familyId));
    await db.delete(children).where(eq(children.familyId, familyId)); // reminder_sends cascade
    await db.update(orders).set({ familyId: null }).where(eq(orders.familyId, familyId));
    await db.insert(auditRecords).values({
      familyId,
      actorAccountId: accountId,
      actorType: 'MEMBER',
      event: 'ACCOUNT_CLOSED',
      targetType: 'family',
      targetId: familyId,
      metadata: { atISO: now.toISOString() },
    });
    await db.delete(families).where(eq(families.id, familyId));
  }

  // ── 2. Families they were invited into: leave, and take what they control ───────
  const elsewhere = await db
    .select({ id: assets.id, familyId: assets.familyId })
    .from(assets)
    .where(eq(assets.controllerAccountId, accountId));
  if (elsewhere.length) {
    await db.update(children).set({ avatarAssetId: null }).where(inArray(children.avatarAssetId, elsewhere.map((r) => r.id)));
  }
  for (const row of elsewhere) {
    await eraseAsset(db, row, actor, { reason: 'account-closed' }, ledger);
    keepsakesDeleted++;
  }
  const left = await db
    .update(memberships)
    .set({ status: 'LEFT', revokedAt: now })
    .where(and(eq(memberships.accountId, accountId), eq(memberships.status, 'ACTIVE')))
    .returning({ familyId: memberships.familyId });
  if (left.length) {
    await db.insert(auditRecords).values(
      left.map((m) => ({
        familyId: m.familyId,
        actorAccountId: accountId,
        actorType: 'MEMBER' as const,
        event: 'MEMBER_LEFT' as const,
        targetType: 'account',
        targetId: accountId,
        metadata: { reason: 'account-closed' },
      })),
    );
  }

  // ── 3. Account-level data ──────────────────────────────────────────────────────
  const ownImages = await db.select().from(profileImages).where(and(eq(profileImages.accountId, accountId), inArray(profileImages.kind, ['AVATAR', 'ACCOUNT_HEADER'])));
  for (const img of ownImages) await eraseProfileImage(db, img, ledger); // picture + header
  await db.delete(sessions).where(eq(sessions.userId, accountId));
  await db.delete(savedDesigns).where(eq(savedDesigns.createdByAccountId, accountId));
  await db.delete(accountCredits).where(eq(accountCredits.accountId, accountId));
  await db.delete(reminderSends).where(eq(reminderSends.accountId, accountId));
  await db.delete(consentRecords).where(eq(consentRecords.accountId, accountId));
  await db.update(promoCodes).set({ active: false }).where(eq(promoCodes.ownerAccountId, accountId));

  // ── 4. Orders: keep the money record, drop the personal details ─────────────────
  // A printed gift note's file still waiting for the printer (plan C9) goes too — it holds the note.
  const withInsert = await db.select({ id: orders.id, insert: orders.giftNoteInsert }).from(orders).where(eq(orders.accountId, accountId));
  for (const o of withInsert) {
    if (o.insert?.status === 'sent' || o.insert?.status === 'partly') await deleteObject(giftNoteInsertKey(o.id)).catch(() => {});
  }
  await db
    .update(orders)
    .set({ buyerEmail: null, shippingAddress: null, giftFromName: null, giftNote: null, tracking: null })
    .where(eq(orders.accountId, accountId));

  // ── 5. The account row: anonymised, can never sign in again ─────────────────────
  await db
    .update(accounts)
    .set({
      email: `closed-${accountId}@closed.invalid`,
      displayName: null,
      passwordHash: null,
      mfaSecret: null,
      emailVerifiedAt: null,
      updatedAt: now,
    })
    .where(eq(accounts.id, accountId));

  await db.insert(auditRecords).values({
    actorAccountId: accountId,
    actorType: 'MEMBER',
    event: 'ACCOUNT_CLOSED',
    targetType: 'account',
    targetId: accountId,
    metadata: { keepsakesDeleted, familiesClosed: owned.length, atISO: now.toISOString() },
  });

  if (!opts.skipLedger) await recordErasure({ kind: 'account', id: accountId, handOver: opts.handOver ?? null }, now);
  return { ok: true, keepsakesDeleted, familiesClosed: owned.length };
}

/**
 * Hand a family to another adult member before the owner closes their account, so the family —
 * and the little ones' keepsakes — carry on. The new head must already be an ACTIVE member of
 * that family (parent-is-controller: only the outgoing parent chooses, nobody self-appoints).
 *
 * What moves: ownership, control of each little one (and so of their keepsakes), every keepsake
 * the outgoing parent controlled that the family could already see, and pending invites + gift
 * lists. What does NOT move: anything the outgoing parent kept "only me" (private to them, so
 * it is erased) and their own saved designs. The new head gets the full Family circle with
 * contribute access + the family calendar, and an email saying so.
 */
export async function handOverFamily(
  db: DbHandle,
  outgoingAccountId: string,
  input: { familyId: string; newOwnerAccountId: string },
  now = new Date(),
  ledger: { skipLedger?: boolean } = {},
): Promise<{ ok: boolean; privateErased: number }> {
  if (input.newOwnerAccountId === outgoingAccountId) return { ok: false, privateErased: 0 };
  const [family] = await db.select().from(families).where(and(eq(families.id, input.familyId), eq(families.ownerAccountId, outgoingAccountId)));
  if (!family) return { ok: false, privateErased: 0 };
  const [heir] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.familyId, family.id), eq(memberships.accountId, input.newOwnerAccountId), eq(memberships.status, 'ACTIVE'), eq(memberships.isOwner, false)));
  if (!heir) return { ok: false, privateErased: 0 };

  // "only me" stays private to the outgoing parent: erased, never handed over
  const privateRows = await db
    .select({ id: assets.id, familyId: assets.familyId })
    .from(assets)
    .where(and(eq(assets.familyId, family.id), eq(assets.controllerAccountId, outgoingAccountId), eq(assets.visibility, 'ONLY_ME')));
  if (privateRows.length) {
    await db.update(children).set({ avatarAssetId: null }).where(inArray(children.avatarAssetId, privateRows.map((r) => r.id)));
  }
  for (const row of privateRows) await eraseAsset(db, row, { accountId: outgoingAccountId, actorType: 'MEMBER' }, { reason: 'account-closed-private' }, ledger);

  await db.update(families).set({ ownerAccountId: input.newOwnerAccountId }).where(eq(families.id, family.id));
  await db
    .update(memberships)
    .set({ isOwner: true, circle: 'FAMILY', accessLevel: 'CONTRIBUTE', seesOccasions: true })
    .where(eq(memberships.id, heir.id));
  // the outgoing owner's own (invite-less) owner row can't exist as a non-owner, so it goes
  await db.delete(memberships).where(and(eq(memberships.familyId, family.id), eq(memberships.accountId, outgoingAccountId)));
  await db.update(children).set({ controllerAccountId: input.newOwnerAccountId }).where(eq(children.familyId, family.id));
  await db
    .update(assets)
    .set({ controllerAccountId: input.newOwnerAccountId, uploaderAccountId: null })
    .where(and(eq(assets.familyId, family.id), eq(assets.controllerAccountId, outgoingAccountId)));
  await db.update(invites).set({ createdByAccountId: input.newOwnerAccountId }).where(eq(invites.familyId, family.id));
  await db.update(giftLinks).set({ createdByAccountId: input.newOwnerAccountId }).where(eq(giftLinks.familyId, family.id));
  await db.delete(savedDesigns).where(and(eq(savedDesigns.familyId, family.id), eq(savedDesigns.createdByAccountId, outgoingAccountId)));

  await db.insert(auditRecords).values({
    familyId: family.id,
    actorAccountId: outgoingAccountId,
    actorType: 'MEMBER',
    event: 'FAMILY_HANDED_OVER',
    targetType: 'account',
    targetId: input.newOwnerAccountId,
    metadata: { privateErased: privateRows.length, atISO: now.toISOString() },
  });

  const [heirAccount] = await db.select({ email: accounts.email, name: accounts.displayName }).from(accounts).where(eq(accounts.id, input.newOwnerAccountId));
  if (heirAccount?.email) {
    await sendMail({
      kind: 'family-handover',
      to: heirAccount.email,
      subject: `you’re now looking after ${family.displayName}`,
      text: [
        `Hi${heirAccount.name ? ` ${heirAccount.name.split(' ')[0]}` : ''},`,
        '',
        `The family’s previous parent has closed their Snickerdoodle account and handed ${family.displayName} to you.`,
        'You now look after the little ones’ keepsakes, decide who’s in the family and what they can see, and can change or delete anything, any time.',
        '',
        `Have a look: ${appUrl('/family')}`,
        '',
        '— the Snickerdoodle team',
      ].join('\n'),
    });
  }
  return { ok: true, privateErased: privateRows.length };
}

export interface ClosurePreview {
  inFlightOrders: number;
  ownedFamilies: {
    familyId: string;
    name: string;
    keepsakes: number;
    privateKeepsakes: number;
    littleOnes: number;
    /** Who could take over (ACTIVE members other than the owner). */
    members: { accountId: string; name: string; relationship: string }[];
  }[];
  otherFamilies: number;
  ownUploadsElsewhere: number;
  orders: number;
}

/** What closing would do, in numbers, shown to the parent BEFORE they confirm. */
export async function closurePreview(db: DbHandle, accountId: string): Promise<ClosurePreview> {
  const inFlight = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.accountId, accountId), inArray(orders.status, IN_FLIGHT)));
  const allOrders = await db.select({ id: orders.id }).from(orders).where(eq(orders.accountId, accountId));
  const owned = await db.select({ id: families.id, name: families.displayName }).from(families).where(eq(families.ownerAccountId, accountId));
  const ownedFamilies: ClosurePreview['ownedFamilies'] = [];
  for (const f of owned) {
    const fAssets = await db.select({ visibility: assets.visibility, controller: assets.controllerAccountId }).from(assets).where(eq(assets.familyId, f.id));
    const kids = await db.select({ id: children.id }).from(children).where(eq(children.familyId, f.id));
    const members = await db
      .select({ accountId: accounts.id, name: accounts.displayName, email: accounts.email, relationship: memberships.relationship })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(and(eq(memberships.familyId, f.id), eq(memberships.status, 'ACTIVE'), eq(memberships.isOwner, false)));
    ownedFamilies.push({
      familyId: f.id,
      name: f.name,
      keepsakes: fAssets.length,
      privateKeepsakes: fAssets.filter((a) => a.visibility === 'ONLY_ME' && a.controller === accountId).length,
      littleOnes: kids.length,
      members: members.map((m) => ({ accountId: m.accountId, name: m.name ?? m.email.split('@')[0] ?? 'member', relationship: m.relationship })),
    });
  }
  const ownedIds = owned.map((f) => f.id);
  const elsewhere = await db.select({ familyId: memberships.familyId }).from(memberships).where(and(eq(memberships.accountId, accountId), eq(memberships.status, 'ACTIVE'), eq(memberships.isOwner, false)));
  const uploads = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.controllerAccountId, accountId));
  return {
    inFlightOrders: inFlight.length,
    ownedFamilies,
    otherFamilies: elsewhere.filter((m) => !ownedIds.includes(m.familyId)).length,
    ownUploadsElsewhere: uploads.filter((u) => u.familyId && !ownedIds.includes(u.familyId)).length,
    orders: allOrders.length,
  };
}
