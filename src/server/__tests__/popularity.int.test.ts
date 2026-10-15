import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { orderItems, orders } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import { unitsSold } from '@/server/popularity';

const DB = process.env.DATABASE_URL;

/** Counts only PAID-and-onward orders inside the window — abandoned checkouts and old sales don't move the range. */
describe.skipIf(!DB)('popularity — what counts as a sale', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const ids: string[] = [];
  // a quiet corner of time, so other tests' orders never land in this window
  const now = new Date('2001-06-01T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  async function order(status: 'PENDING' | 'PAID' | 'SHIPPED' | 'CANCELLED', paidAt: Date | null, lines: [string, number][]) {
    const [o] = await db
      .insert(orders)
      .values({ ref: `POP-${Math.random().toString(36).slice(2, 10)}`, status, subtotalPence: 1000, deliveryPence: 0, totalPence: 1000, paidAt })
      .returning();
    ids.push(o!.id);
    for (const [productKey, qty] of lines) await db.insert(orderItems).values({ orderId: o!.id, productKey, qty, unitPricePence: 1000, linePence: 1000 * qty });
  }

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    await order('PAID', daysAgo(5), [['blanket', 2], ['mug', 1]]);
    await order('SHIPPED', daysAgo(60), [['blanket', 1]]);
    await order('PENDING', null, [['card', 9]]); // abandoned checkout
    await order('CANCELLED', daysAgo(3), [['card', 9]]);
    await order('PAID', daysAgo(120), [['jigsaw', 9]]); // outside the 90-day window
    await order('PAID', new Date(now.getTime() + 86_400_000), [['jigsaw', 9]]); // after "now"
  });
  afterAll(async () => {
    if (ids.length) await db.delete(orders).where(inArray(orders.id, ids));
    await client.end();
  });

  it('sums units from paid orders in the last 90 days', async () => {
    const sold = await unitsSold(db, now);
    expect(sold.get('blanket')).toBe(3);
    expect(sold.get('mug')).toBe(1);
    expect(sold.has('card')).toBe(false);
    expect(sold.has('jigsaw')).toBe(false);
  });
});
