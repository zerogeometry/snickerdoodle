import { and, eq, gt, inArray, not, or, sql, type SQL } from 'drizzle-orm';
import { accounts, orders, promoCodes } from '@/db/schema';
import { codeTerms, normalisePromoCode, type PromoRule } from '@/pricing';
import type { DbHandle, Tx } from './db';
import { hasPaidOrderBefore } from './referrals';

export type PromoRefusal = 'unknown' | 'not-started' | 'expired' | 'used-up' | 'own-code' | 'first-order-only' | 'needs-buyer';
export type PromoResolution = { ok: true; rule: PromoRule } | { ok: false; reason: PromoRefusal };

/** Who's buying, server-resolved: the signed-in account, or a guest's own email (never a client claim
 * about anyone else). Personal referral codes are checked against it. */
export type PromoBuyer = { accountId: string | null; email?: string | null };

/**
 * How long a checkout carrying a code holds one of its uses. The Stripe session is made to expire
 * then too (createCheckoutSession), so a held use is either paid inside the window or never.
 */
export const PROMO_HOLD_MS = 60 * 60 * 1000;
/** The Stripe session's own lifetime, in seconds — the hold, less a little so it always ends first. */
export const CHECKOUT_SESSION_TTL_SEC = PROMO_HOLD_MS / 1000 - 60;

const PAID = ['PAID', 'FULFILLING', 'SHIPPED'] as const;

/** A guest's email as they typed it — trimmed, lowercased, and only if it looks like one. */
export function normaliseBuyerEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

const sameBuyer = (buyer: PromoBuyer | null | undefined): SQL | undefined => {
  const who = [
    buyer?.accountId ? eq(orders.accountId, buyer.accountId) : undefined,
    buyer?.email ? sql`lower(${orders.buyerEmail}) = ${buyer.email.toLowerCase()}` : undefined,
  ].filter((x): x is SQL => !!x);
  return who.length ? or(...who) : undefined;
};

/**
 * Uses of a code that count against its limit: every paid order, plus every checkout still open
 * with it (PENDING, inside the hold) — so two shoppers at Stripe at once can't both take the last
 * use. The buyer's OWN open checkouts don't count against them (going back from Stripe and trying
 * again must not lock them out of their code).
 */
async function usesOf(db: DbHandle | Tx, codeId: string, now: Date, buyer: PromoBuyer | null | undefined): Promise<number> {
  const mine = sameBuyer(buyer);
  const held = and(eq(orders.status, 'PENDING'), gt(orders.createdAt, new Date(now.getTime() - PROMO_HOLD_MS)), mine ? not(mine) : undefined);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.promoCodeId, codeId), or(inArray(orders.status, [...PAID]), held)));
  return count?.n ?? 0;
}

/** Is this buyer the code's own partner — a referral code's owner, or a creator by their email? */
async function isOwnCode(db: DbHandle | Tx, row: typeof promoCodes.$inferSelect, buyer: PromoBuyer | null | undefined): Promise<boolean> {
  const email = buyer?.email?.toLowerCase() ?? null;
  if (row.partnerEmail && email && row.partnerEmail.toLowerCase() === email) return true;
  if (!row.ownerAccountId) return false;
  if (buyer?.accountId === row.ownerAccountId) return true;
  if (!email) return false;
  const [owner] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, row.ownerAccountId));
  return !!owner && owner.email.toLowerCase() === email;
}

/**
 * Who a code is for (codeTerms): never your own; a first-order code only on the buyer's first PAID
 * order. Checked against WHO is buying: a signed-in account, or a guest by their email. With
 * neither, it can't be checked, so it isn't given (checkout asks for an email; it applies then).
 */
async function personalRefusal(db: DbHandle | Tx, row: typeof promoCodes.$inferSelect, buyer: PromoBuyer | null | undefined): Promise<PromoRefusal | null> {
  const { firstOrderOnly } = codeTerms(row);
  if (!row.ownerAccountId && !row.partnerEmail && !firstOrderOnly) return null;
  const email = buyer?.email?.toLowerCase() ?? null;
  if (!buyer?.accountId && !email) return 'needs-buyer';
  if (await isOwnCode(db, row, { accountId: buyer?.accountId ?? null, email })) return 'own-code';
  if (firstOrderOnly && (await hasPaidOrderBefore(db, { accountId: buyer?.accountId, email }))) return 'first-order-only';
  return null;
}

/**
 * Resolve what a customer typed into a validated, server-side rule. The client only ever sends
 * the code text; value, minimum spend and commission come from the DB. Redemptions count PAID
 * (or later) orders and open checkouts inside the hold, so an abandoned checkout never burns a
 * limited code for longer than the hold.
 */
export async function resolvePromo(
  db: DbHandle,
  raw: string | null | undefined,
  now = new Date(),
  /** Who's buying (server-resolved), for personal referral codes: never your own, first order only. */
  buyer?: PromoBuyer | null,
): Promise<PromoResolution> {
  const code = normalisePromoCode(raw);
  if (!code) return { ok: false, reason: 'unknown' };
  const [row] = await db.select().from(promoCodes).where(and(eq(promoCodes.code, code), eq(promoCodes.active, true)));
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.startsAt && row.startsAt > now) return { ok: false, reason: 'not-started' };
  if (row.endsAt && row.endsAt <= now) return { ok: false, reason: 'expired' };
  if (row.maxRedemptions !== null && (await usesOf(db, row.id, now, buyer)) >= row.maxRedemptions) return { ok: false, reason: 'used-up' };
  const personal = await personalRefusal(db, row, buyer);
  if (personal) return { ok: false, reason: personal };
  return {
    ok: true,
    rule: { id: row.id, code: row.code, kind: row.kind, value: row.value, minSpendPence: row.minSpendPence, commissionBps: row.commissionBps },
  };
}

/**
 * The placement-time re-check, INSIDE the transaction that writes the order: the code's row is
 * locked (FOR UPDATE) so two checkouts can't both read "one use left" — the second waits, then
 * counts the first one's open checkout. Returns why the code can no longer be used, or null.
 */
export async function claimPromoForOrder(tx: Tx, codeId: string, buyer: PromoBuyer | null, now = new Date()): Promise<PromoRefusal | null> {
  const [row] = await tx.select().from(promoCodes).where(eq(promoCodes.id, codeId)).for('update');
  if (!row || !row.active) return 'unknown';
  if (row.startsAt && row.startsAt > now) return 'not-started';
  if (row.endsAt && row.endsAt <= now) return 'expired';
  if (row.maxRedemptions !== null && (await usesOf(tx, row.id, now, buyer)) >= row.maxRedemptions) return 'used-up';
  return personalRefusal(tx, row, buyer);
}

/**
 * A partner's commission, settled ONCE — inside the transaction that flips the order to PAID
 * (markOrderPaid), so the order row's partner_commission_pence is final the moment it's paid.
 * The commission quoted at checkout stands only if this is still the follower's FIRST paid order
 * (by account or email; codeTerms — a PTA earns on every order) and they aren't the partner. A
 * per-buyer advisory lock means two first orders paid at the same moment can't both earn: the
 * second waits, then sees the first one paid. Returns the commission that accrued (0 = none).
 */
export async function settlePartnerCommission(tx: Tx, order: typeof orders.$inferSelect): Promise<number> {
  if (order.partnerCommissionPence <= 0 || !order.promoCodeId) return 0;
  const [code] = await tx.select().from(promoCodes).where(eq(promoCodes.id, order.promoCodeId));
  let email = order.buyerEmail?.toLowerCase() ?? null;
  if (!email && order.accountId) email = (await tx.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, order.accountId)))[0]?.email.toLowerCase() ?? null;
  const buyer = { accountId: order.accountId, email };
  let earns = !!code && !(await isOwnCode(tx, code, buyer));
  if (earns && codeTerms(code!).commissionFirstOrderOnly) {
    if (!buyer.accountId && !email) earns = false; // can't tell it's a first order → no commission
    else {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`first-order:${email ?? buyer.accountId}`}))`);
      earns = !(await hasPaidOrderBefore(tx, buyer, order.id));
    }
  }
  if (earns) return order.partnerCommissionPence;
  await tx.update(orders).set({ partnerCommissionPence: 0 }).where(eq(orders.id, order.id));
  return 0;
}
