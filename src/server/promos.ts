import { and, eq, inArray, sql } from 'drizzle-orm';
import { orders, promoCodes } from '@/db/schema';
import { normalisePromoCode, type PromoRule } from '@/pricing';
import type { DbHandle } from './db';
import { hasPaidOrderBefore } from './referrals';

export type PromoResolution =
  | { ok: true; rule: PromoRule }
  | { ok: false; reason: 'unknown' | 'not-started' | 'expired' | 'used-up' | 'own-code' | 'first-order-only' };

/**
 * Resolve what a customer typed into a validated, server-side rule. The client only ever sends
 * the code text; value, minimum spend and commission come from the DB. Redemptions count PAID
 * (or later) orders, so an abandoned checkout never burns a limited code.
 */
export async function resolvePromo(
  db: DbHandle,
  raw: string | null | undefined,
  now = new Date(),
  /** Who's buying (server-resolved), for personal referral codes: never your own, first order only. */
  buyer?: { accountId: string | null; email?: string | null } | null,
): Promise<PromoResolution> {
  const code = normalisePromoCode(raw);
  if (!code) return { ok: false, reason: 'unknown' };
  const [row] = await db.select().from(promoCodes).where(and(eq(promoCodes.code, code), eq(promoCodes.active, true)));
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.startsAt && row.startsAt > now) return { ok: false, reason: 'not-started' };
  if (row.endsAt && row.endsAt <= now) return { ok: false, reason: 'expired' };
  if (row.maxRedemptions !== null) {
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.promoCodeId, row.id), inArray(orders.status, ['PAID', 'FULFILLING', 'SHIPPED'])));
    if ((count?.n ?? 0) >= row.maxRedemptions) return { ok: false, reason: 'used-up' };
  }
  if (row.ownerAccountId && buyer?.accountId === row.ownerAccountId) return { ok: false, reason: 'own-code' };
  if (row.firstOrderOnly && buyer && (await hasPaidOrderBefore(db, { accountId: buyer.accountId, email: buyer.email }))) {
    return { ok: false, reason: 'first-order-only' };
  }
  return {
    ok: true,
    rule: { id: row.id, code: row.code, kind: row.kind, value: row.value, minSpendPence: row.minSpendPence, commissionBps: row.commissionBps },
  };
}
