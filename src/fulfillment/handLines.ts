import { eq } from 'drizzle-orm';
import { accounts } from '@/db/schema';
import { sendMail } from '@/server/mail';
import type { DbHandle } from '@/server/db';

/**
 * Lines the printer doesn't make (gift wrap today) are the founder's to do by hand. They must
 * never vanish quietly: when an order with such lines is submitted to (or skipped by) the POD,
 * tell the people who pack them — ORDER_ALERT_EMAILS (comma-separated), else every admin.
 * Order ref + product names only. A failed alert never fails fulfilment; it's logged loudly.
 */
export async function alertHandLines(
  db: DbHandle,
  order: { ref: string },
  productKeys: string[],
  how: 'with-printed-items' | 'hand-only',
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (productKeys.length === 0) return;
  const items = [...new Set(productKeys)].join(', ');
  console.error(`[fulfilment] order ${order.ref} needs packing by hand: ${items}`);
  try {
    const fromEnv = (env.ORDER_ALERT_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'));
    const to = fromEnv.length ? fromEnv : (await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.isAdmin, true))).map((a) => a.email);
    for (const email of new Set(to)) {
      await sendMail({
        kind: 'order-ops',
        to: email,
        subject: `order ${order.ref} needs something by hand`,
        text: [
          `order ${order.ref} includes: ${items}.`,
          how === 'with-printed-items'
            ? 'the printed items have gone to the printer — this part is yours to send.'
            : 'nothing in it is printed — the whole order is yours to send.',
          `the delivery address is on its stripe payment (search for ${order.ref}).`,
        ].join('\n'),
      });
    }
  } catch (e) {
    console.error(`[fulfilment] FAILED to send the hand-packing alert for ${order.ref}`, e instanceof Error ? e.message : e);
  }
}
