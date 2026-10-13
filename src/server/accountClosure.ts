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
  promoCodes,
  reminderSends,
  savedDesigns,
  sessions,
} from '@/db/schema';
import { eraseAsset } from './assets';
import type { DbHandle } from './db';

/** Orders still being made — closing waits for these (their source art is needed to print). */
const IN_FLIGHT = ['PAID', 'FULFILLING'] as const;

export type CloseAccountResult =
  | { ok: true; keepsakesDeleted: number; familiesClosed: number }
  | { ok: false; reason: 'order-in-flight' | 'not-found' };

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
export async function closeAccount(db: DbHandle, accountId: string, now = new Date()): Promise<CloseAccountResult> {
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId));
  if (!account) return { ok: false, reason: 'not-found' };

  const inFlight = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.accountId, accountId), inArray(orders.status, IN_FLIGHT)));
  if (inFlight.length > 0) return { ok: false, reason: 'order-in-flight' };

  let keepsakesDeleted = 0;
  const actor = { accountId, actorType: 'MEMBER' as const };

  // ── 1. Families they own: close them entirely ────────────────────────────────
  const owned = await db.select({ id: families.id }).from(families).where(eq(families.ownerAccountId, accountId));
  for (const { id: familyId } of owned) {
    await db.update(children).set({ avatarAssetId: null }).where(eq(children.familyId, familyId)); // unpin before erasing
    const rows = await db.select({ id: assets.id, familyId: assets.familyId }).from(assets).where(eq(assets.familyId, familyId));
    for (const row of rows) {
      await eraseAsset(db, row, actor, { reason: 'account-closed' });
      keepsakesDeleted++;
    }
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
    await eraseAsset(db, row, actor, { reason: 'account-closed' });
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
  await db.delete(sessions).where(eq(sessions.userId, accountId));
  await db.delete(savedDesigns).where(eq(savedDesigns.createdByAccountId, accountId));
  await db.delete(accountCredits).where(eq(accountCredits.accountId, accountId));
  await db.delete(reminderSends).where(eq(reminderSends.accountId, accountId));
  await db.delete(consentRecords).where(eq(consentRecords.accountId, accountId));
  await db.update(promoCodes).set({ active: false }).where(eq(promoCodes.ownerAccountId, accountId));

  // ── 4. Orders: keep the money record, drop the personal details ─────────────────
  await db
    .update(orders)
    .set({ buyerEmail: null, shippingAddress: null, giftFromName: null, tracking: null })
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

  return { ok: true, keepsakesDeleted, familiesClosed: owned.length };
}
