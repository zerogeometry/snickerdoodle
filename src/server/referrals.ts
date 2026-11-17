import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { accountCredits, orders } from '@/db/schema';
import type { DbHandle, Tx } from './db';

/**
 * Account credit + "is this a first order?". Parents' personal referral codes ("give £5, get £5") were RETIRED
 * on 17 Nov 2026 (founder): a parent shares through gift links, for their family's sake, and the one welcome is
 * the free first card (src/server/promos.ts). Old referral codes are refused at checkout; credit already earned
 * stays on the ledger and still comes off the next order.
 */

const PAID = ['PAID', 'FULFILLING', 'SHIPPED'] as const;

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
  db: DbHandle | Tx,
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
 * spent. (Referral rewards are retired — no code earns a parent credit any more.) Idempotent: the
 * ledger's (order, reason, account) uniqueness makes a retry a no-op.
 */
export async function settlePaidOrderCredits(db: DbHandle, orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || !(order.creditAppliedPence > 0) || !order.accountId) return;
  await db
    .insert(accountCredits)
    .values({ accountId: order.accountId, deltaPence: -order.creditAppliedPence, reason: 'SPENT', orderId: order.id })
    .onConflictDoNothing();
}
