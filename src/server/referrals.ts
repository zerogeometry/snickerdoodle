import { randomBytes } from 'node:crypto';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { accountCredits, accounts, orders, promoCodes } from '@/db/schema';
import type { DbHandle } from './db';

/** "Give £5, get £5": the friend's first order gets £5 off (over £30); the referrer earns £5 credit. */
export const REFERRAL_DISCOUNT_PENCE = 500;
export const REFERRAL_MIN_SPEND_PENCE = 3000;
export const REFERRAL_REWARD_PENCE = 500;

const PAID = ['PAID', 'FULFILLING', 'SHIPPED'] as const;
const SAFE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L — easy to read aloud

/** The parent's personal referral code — created on first ask, then always the same. */
export async function getOrCreateReferralCode(db: DbHandle, account: { id: string; email: string; name: string | null }): Promise<string> {
  const [existing] = await db.select({ code: promoCodes.code }).from(promoCodes).where(eq(promoCodes.ownerAccountId, account.id));
  if (existing) return existing.code;
  const stem = (account.name ?? account.email.split('@')[0] ?? 'FRIEND').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'FRIEND';
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = randomBytes(4);
    const suffix = Array.from(bytes, (b) => SAFE[b % SAFE.length]).join('');
    const code = `${stem}-${suffix}`;
    const inserted = await db
      .insert(promoCodes)
      .values({
        code,
        kind: 'FIXED',
        value: REFERRAL_DISCOUNT_PENCE,
        minSpendPence: REFERRAL_MIN_SPEND_PENCE,
        partnerType: 'REFERRAL',
        partnerName: 'referral',
        ownerAccountId: account.id,
        firstOrderOnly: true,
      })
      .onConflictDoNothing()
      .returning({ code: promoCodes.code });
    if (inserted[0]) return inserted[0].code;
  }
  throw new Error('could not mint a referral code');
}

/** Credit balance from the append-only ledger. */
export async function getCreditBalance(db: DbHandle, accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${accountCredits.deltaPence}), 0)::int` })
    .from(accountCredits)
    .where(eq(accountCredits.accountId, accountId));
  return Math.max(0, row?.n ?? 0);
}

/** Has this buyer (by account or email) already had a paid order (other than `exceptOrderId`)? */
export async function hasPaidOrderBefore(
  db: DbHandle,
  buyer: { accountId?: string | null; email?: string | null },
  exceptOrderId?: string,
): Promise<boolean> {
  const who = [
    buyer.accountId ? eq(orders.accountId, buyer.accountId) : undefined,
    buyer.email ? sql`lower(${orders.buyerEmail}) = ${buyer.email.toLowerCase()}` : undefined,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  if (who.length === 0) return false;
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(inArray(orders.status, [...PAID]), or(...who), exceptOrderId ? ne(orders.id, exceptOrderId) : undefined))
    .limit(1);
  return !!row;
}

/**
 * After an order is PAID (called once, on the real PENDING→PAID flip): debit any credit it
 * spent, and — for a referral code — reward the referrer, but only for a genuinely new buyer
 * (not the referrer themselves, no earlier paid order by that account/email). Idempotent: the
 * ledger's (order, reason, account) uniqueness makes a retry a no-op.
 */
export async function settlePaidOrderCredits(db: DbHandle, orderId: string): Promise<void> {
  const [o] = await db
    .select({ order: orders, accountEmail: accounts.email })
    .from(orders)
    .leftJoin(accounts, eq(accounts.id, orders.accountId))
    .where(eq(orders.id, orderId));
  if (!o) return;
  const order = o.order;

  if (order.creditAppliedPence > 0 && order.accountId) {
    await db
      .insert(accountCredits)
      .values({ accountId: order.accountId, deltaPence: -order.creditAppliedPence, reason: 'SPENT', orderId: order.id })
      .onConflictDoNothing();
  }

  if (!order.promoCodeId) return;
  const [code] = await db.select().from(promoCodes).where(eq(promoCodes.id, order.promoCodeId));
  if (!code?.ownerAccountId || code.partnerType !== 'REFERRAL') return;
  const buyerEmail = (order.buyerEmail ?? o.accountEmail ?? '').toLowerCase();
  const [owner] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, code.ownerAccountId));
  if (!owner || !buyerEmail) return;
  if (order.accountId === code.ownerAccountId || buyerEmail === owner.email.toLowerCase()) return; // no self-referral
  if (await hasPaidOrderBefore(db, { accountId: order.accountId, email: buyerEmail }, order.id)) return; // first orders only
  await db
    .insert(accountCredits)
    .values({ accountId: code.ownerAccountId, deltaPence: REFERRAL_REWARD_PENCE, reason: 'REFERRAL_REWARD', orderId: order.id })
    .onConflictDoNothing();
}
