import { and, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { accounts, auditRecords, orderItemArtwork, orderItems, orders, products, promoCodes } from '@/db/schema';
import type { Reviewer } from '@/authz';
import type { DbHandle } from '../db';
import { assertAdmin } from './today';

/**
 * The admin app's Orders screen: find an order, see where it is, and the few safe things a person can do.
 * No child pictures and no child names here: product names and counts. A customer's email and address are shown
 * only when asked for ("show customer details"), and that look is recorded in the audit trail.
 */

export type OrderFilter = 'attention' | 'all' | 'paid' | 'prodigi' | 'shipped' | 'money-back';
export const ORDER_FILTERS: { id: OrderFilter; label: string }[] = [
  { id: 'attention', label: 'needs attention' },
  { id: 'all', label: 'all' },
  { id: 'paid', label: 'paid' },
  { id: 'prodigi', label: 'at Prodigi' },
  { id: 'shipped', label: 'shipped' },
  { id: 'money-back', label: 'refunded or cancelled' },
];

/** An order's status in the admin app's words. */
export const STATUS_WORDS: Record<string, string> = { PENDING: 'not paid', PAID: 'paid', FULFILLING: 'at Prodigi', SHIPPED: 'shipped', CANCELLED: 'cancelled' };

export interface OrderRow {
  ref: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  totalPence: number;
  refundedPence: number;
  items: number;
  disputed: boolean;
  trouble: boolean;
  isGift: boolean;
  /** An admin's own sample, at cost (src/server/samples.ts) — never a sale. */
  isSample: boolean;
}

const TROUBLED = ['RENDER_FAILED', 'ERROR', 'BLOCKED_GATE'] as const;
const troubleSql = sql<boolean>`exists (select 1 from ${orderItemArtwork} a join ${orderItems} i on i.id = a.order_item_id where i.order_id = "orders"."id" and a.status in ('RENDER_FAILED', 'ERROR', 'BLOCKED_GATE'))`;

/** Orders, newest first. `q`: an order number (or part of one) or a customer's email. */
export async function listOrders(db: DbHandle, reviewer: Reviewer, opts: { filter?: OrderFilter; q?: string; limit?: number } = {}): Promise<OrderRow[]> {
  assertAdmin(reviewer);
  const filter = opts.filter ?? 'attention';
  const q = (opts.q ?? '').trim();
  const where: (SQL | undefined)[] = [];
  if (filter === 'paid') where.push(eq(orders.status, 'PAID'));
  if (filter === 'prodigi') where.push(eq(orders.status, 'FULFILLING'));
  if (filter === 'shipped') where.push(eq(orders.status, 'SHIPPED'));
  if (filter === 'money-back') where.push(or(gt(orders.refundedPence, 0), eq(orders.status, 'CANCELLED'), sql`${orders.dispute} is not null`));
  if (filter === 'attention')
    where.push(
      or(
        and(eq(orders.status, 'PAID'), troubleSql),
        // Prodigi refused it (or sending failed): straight away, not two hours later (founder, 26 Nov 2026)
        and(eq(orders.status, 'PAID'), sql`${orders.submitError} is not null`),
        and(eq(orders.status, 'PAID'), sql`${orders.paidAt} < now() - interval '2 hours'`, isNull(orders.prodigiOrderId)),
        and(eq(orders.status, 'FULFILLING'), sql`coalesce(${orders.claimedAt}, ${orders.paidAt}) < now() - interval '7 days'`),
        and(eq(orders.status, 'FULFILLING'), sql`${orders.refundedPence} >= ${orders.totalPence}`, gt(orders.refundedPence, 0)),
        sql`${orders.dispute} ->> 'status' in ('needs_response', 'warning_needs_response')`,
      ),
    );
  if (filter !== 'money-back') where.push(sql`${orders.status} <> 'PENDING'`); // checkouts never paid aren't orders yet
  if (q) {
    if (q.includes('@')) {
      const email = q.toLowerCase();
      where.push(or(eq(orders.buyerEmail, email), sql`${orders.accountId} in (select ${accounts.id} from ${accounts} where lower(${accounts.email}) = ${email})`));
    } else where.push(ilike(orders.ref, `%${q.replace(/[%_\\]/g, '')}%`));
  }
  const rows = await db
    .select({
      ref: orders.ref,
      status: orders.status,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      totalPence: orders.totalPence,
      refundedPence: orders.refundedPence,
      dispute: orders.dispute,
      isGift: orders.isGift,
      isSample: orders.isSample,
      items: sql<number>`(select coalesce(sum(i.qty), 0)::int from ${orderItems} i where i.order_id = "orders"."id")`,
      trouble: troubleSql,
    })
    .from(orders)
    .where(and(...where))
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 100);
  return rows.map((r) => ({ ...r, disputed: !!r.dispute && !r.dispute.closedAt, dispute: undefined }) as OrderRow);
}

export interface OrderDetail {
  ref: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  claimedAt: Date | null;
  prodigiOrderId: string | null;
  /** The phone case's own Prodigi order, when it went separately. */
  prodigiSplitOrderId: string | null;
  stripePaymentIntent: string | null;
  shippingMethod: string | null;
  tracking: { carrier?: string | null; number?: string | null; url?: string | null } | null;
  submitError: string | null;
  money: { subtotalPence: number; deliveryPence: number; savingsPence: number; promoSavingPence: number; creditPence: number; totalPence: number; refundedPence: number; refundedAt: Date | null };
  dispute: NonNullable<typeof orders.$inferSelect.dispute> | null;
  code: { code: string; partner: string | null } | null;
  isGift: boolean;
  /** An admin's own sample, at cost: its "delivery" is Stripe's card fee. */
  isSample: boolean;
  guest: boolean;
  lines: { product: string; qty: number; linePence: number; states: string[]; problems: string[] }[];
  canRetry: boolean;
}

/** One order, without personal details (those come from revealContact). */
export async function orderDetail(db: DbHandle, reviewer: Reviewer, ref: string): Promise<OrderDetail | null> {
  assertAdmin(reviewer);
  const [o] = await db.select().from(orders).where(eq(orders.ref, ref));
  if (!o) return null;
  const lines = await db
    .select({ id: orderItems.id, productKey: orderItems.productKey, label: products.label, qty: orderItems.qty, linePence: orderItems.linePence })
    .from(orderItems)
    .leftJoin(products, eq(products.key, orderItems.productKey))
    .where(eq(orderItems.orderId, o.id))
    .orderBy(orderItems.seq);
  const art = lines.length
    ? await db
        .select({ orderItemId: orderItemArtwork.orderItemId, status: orderItemArtwork.status, renderError: orderItemArtwork.renderError })
        .from(orderItemArtwork)
        .where(inArray(orderItemArtwork.orderItemId, lines.map((l) => l.id)))
    : [];
  const [code] = o.promoCodeId ? await db.select({ code: promoCodes.code, partner: promoCodes.partnerName }).from(promoCodes).where(eq(promoCodes.id, o.promoCodeId)) : [];
  const troubled = art.some((a) => (TROUBLED as readonly string[]).includes(a.status));
  return {
    ref: o.ref,
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    claimedAt: o.claimedAt,
    prodigiOrderId: o.prodigiOrderId,
    prodigiSplitOrderId: o.prodigiSplitOrderId,
    stripePaymentIntent: o.stripePaymentIntent,
    shippingMethod: o.shippingMethod,
    tracking: o.tracking,
    submitError: o.submitError,
    money: {
      subtotalPence: o.subtotalPence,
      deliveryPence: o.deliveryPence,
      savingsPence: o.joinSavingPence + o.familySetSavingPence + o.parcelSavingPence + o.multiBuySavingPence,
      promoSavingPence: o.promoSavingPence,
      creditPence: o.creditAppliedPence,
      totalPence: o.totalPence,
      refundedPence: o.refundedPence,
      refundedAt: o.refundedAt,
    },
    dispute: o.dispute,
    code: code ?? null,
    isGift: o.isGift,
    isSample: o.isSample,
    guest: !o.accountId,
    lines: lines.map((l) => {
      const mine = art.filter((a) => a.orderItemId === l.id);
      return {
        product: l.label ?? l.productKey,
        qty: l.qty,
        linePence: l.linePence,
        states: mine.map((a) => a.status),
        // render errors are our own messages (sizes, timeouts), never personal data; trimmed for the screen
        problems: mine.filter((a) => a.renderError && (TROUBLED as readonly string[]).includes(a.status)).map((a) => a.renderError!.slice(0, 200)),
      };
    }),
    canRetry: o.status === 'PAID' && !o.prodigiOrderId && (troubled || !!o.submitError),
  };
}

/** The customer's email and delivery address, for one order: recorded in the audit trail (who looked, when, which order). */
export async function revealContact(db: DbHandle, reviewer: Reviewer, ref: string): Promise<{ email: string | null; address: string[] } | null> {
  assertAdmin(reviewer);
  const [o] = await db
    .select({ id: orders.id, familyId: orders.familyId, buyerEmail: orders.buyerEmail, accountEmail: accounts.email, address: orders.shippingAddress })
    .from(orders)
    .leftJoin(accounts, eq(accounts.id, orders.accountId))
    .where(eq(orders.ref, ref));
  if (!o) return null;
  await db.insert(auditRecords).values({ familyId: o.familyId, actorAccountId: reviewer.accountId, actorType: 'ADMIN', event: 'ADMIN_PERSONAL_DATA_VIEWED', targetType: 'order', targetId: o.id, metadata: { what: 'order contact' } });
  const a = o.address;
  return { email: o.accountEmail ?? o.buyerEmail, address: a ? [a.name, a.line1, a.line2 ?? '', a.townOrCity, a.postcode, a.countryCode].filter(Boolean) : [] };
}

/**
 * "Try again" on a stuck order not yet at Prodigi: print files that failed are queued to be made again, and the next
 * fulfilment tick (every 5 minutes) tries handing it over at once instead of waiting out its backoff. Safe to press
 * twice; never touches an order Prodigi already has.
 */
export async function retryOrder(db: DbHandle, reviewer: Reviewer, ref: string): Promise<boolean> {
  assertAdmin(reviewer);
  const [o] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.ref, ref), eq(orders.status, 'PAID'), isNull(orders.prodigiOrderId)));
  if (!o) return false;
  const itemIds = (await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, o.id))).map((r) => r.id);
  if (itemIds.length)
    await db
      .update(orderItemArtwork)
      .set({ status: 'PENDING', renderError: null, renderClaimedAt: null })
      .where(and(inArray(orderItemArtwork.orderItemId, itemIds), inArray(orderItemArtwork.status, ['RENDER_FAILED', 'ERROR'])));
  await db.update(orders).set({ nextSubmitAttemptAt: new Date() }).where(eq(orders.id, o.id));
  return true;
}

export const stripePaymentUrl = (pi: string) => `https://dashboard.stripe.com/payments/${encodeURIComponent(pi)}`;
export const prodigiOrderUrl = (id: string) => `https://dashboard.prodigi.com/orders/${encodeURIComponent(id)}`;
