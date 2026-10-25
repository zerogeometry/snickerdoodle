import { and, gte, inArray, isNotNull, lte, notInArray, sql } from 'drizzle-orm';
import { orderItems, orders, products } from '@/db/schema';
import type { DbHandle } from './db';
import { seasonalExpected, seasonClock } from '@/lib/season';

/**
 * The order products appear in on the range — "most popular" first.
 *
 * It starts as the founder's EXPECTED order and turns into the ACTUAL order as sales come in: every
 * product gets a head start of pseudo-sales from its expected place (PRIOR_STRENGTH in all,
 * weighted toward the top), then real units sold in the last POPULARITY_WINDOW_DAYS (paid orders
 * only) are added. With little data the expected order holds; once real sales outweigh the head
 * start, they decide. A rolling window, so the order follows what parents want NOW (Christmas
 * cards in November, tees in summer). Recomputed daily (/api/jobs/popularity) and on every seed.
 *
 * Only products listed here are "popular" (shown in the range); anything else lives in the full
 * catalogue. Hidden products may sit in the list — the shop still only shows visibleInShop ones.
 */
export const EXPECTED_POPULARITY = [
  'framedPrint', 'mug', 'kidsTee', 'card', 'phoneCase', 'cushion', 'jigsaw', 'adultTee', 'blanket', 'storybook', 'babyBodysuit',
  // the range expansion (D21) joins the same range — one collection, shown together (founder, 2026-10-21)
  'cardPack', 'heightChart', 'socks', 'teaTowel', 'wrappingPaper', 'playingCards', 'kidsHoodie', 'adultHoodie', 'petBandana',
];

export const POPULARITY_WINDOW_DAYS = 90;
/** How many sales the expected order is "worth" in total — real sales take over beyond this. */
// (100 with the 21-product list: the same "a few sales nudge, many decide" as 50 was with 11.)
export const PRIOR_STRENGTH = 100;

const SOLD_STATUSES = ['PAID', 'FULFILLING', 'SHIPPED'] as const;

/** The head start each product gets from its expected place: linearly falling, summing to PRIOR_STRENGTH. */
export function priorScores(expected: string[] = EXPECTED_POPULARITY): Map<string, number> {
  const n = expected.length;
  const total = (n * (n + 1)) / 2;
  return new Map(expected.map((k, i) => [k, ((n - i) / total) * PRIOR_STRENGTH]));
}

/** Expected head start + real units sold → the order to show (ties keep the expected order). */
export function rankByPopularity(sold: Map<string, number>, expected: string[] = EXPECTED_POPULARITY): string[] {
  const prior = priorScores(expected);
  const score = (k: string) => (prior.get(k) ?? 0) + (sold.get(k) ?? 0);
  return [...expected].sort((a, b) => score(b) - score(a) || expected.indexOf(a) - expected.indexOf(b));
}

/** Units sold per product in the window (paid orders only — abandoned checkouts don't count). */
export async function unitsSold(db: DbHandle, now = new Date()): Promise<Map<string, number>> {
  const since = new Date(now.getTime() - POPULARITY_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({ key: orderItems.productKey, units: sql<number>`coalesce(sum(${orderItems.qty}), 0)::int` })
    .from(orderItems)
    .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
    .where(and(inArray(orders.status, [...SOLD_STATUSES]), isNotNull(orders.paidAt), gte(orders.paidAt, since), lte(orders.paidAt, now)))
    .groupBy(orderItems.productKey);
  return new Map(rows.map((r) => [r.key, Number(r.units)]));
}

/** Re-rank the range from the expected order + recent sales, and store it on the products. */
export async function recomputePopularity(db: DbHandle, now = new Date()): Promise<{ order: string[]; sold: Record<string, number> }> {
  const sold = await unitsSold(db, now);
  // Christmas (D24): while the season is on, the festive range leads in a fixed order, the rest
  // follows by popularity; outside it this is just the popularity order (src/lib/season.ts).
  const order = seasonalExpected(rankByPopularity(sold), seasonClock(now));
  for (const [i, key] of order.entries()) {
    await db.update(products).set({ popularRank: i + 1 }).where(sql`${products.key} = ${key}`);
  }
  await db.update(products).set({ popularRank: null }).where(notInArray(products.key, order));
  return { order, sold: Object.fromEntries(sold) };
}
