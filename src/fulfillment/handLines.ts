import { SUPPORT_EMAIL } from '@/lib/support';
import { sendMail } from '@/server/mail';

/**
 * Lines the printer doesn't make (gift wrap today) are the founder's to do by hand. They must
 * never vanish quietly: when an order with such lines is submitted to (or skipped by) the POD,
 * tell the people who pack them — ORDER_ALERT_EMAILS (comma-separated), else the team inbox
 * (SUPPORT_INBOX, else support@ — the same place a content report goes). Order ref + product
 * names only, never a child's name or picture. A failed alert never fails fulfilment; it's
 * logged loudly.
 */
export async function alertHandLines(
  order: { ref: string },
  productKeys: string[],
  how: 'with-printed-items' | 'hand-only',
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (productKeys.length === 0) return;
  const items = [...new Set(productKeys)].join(', ');
  console.error(`[fulfilment] order ${order.ref} needs packing by hand: ${items}`);
  const fromEnv = (env.ORDER_ALERT_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
  const to = fromEnv.length ? fromEnv : [(env.SUPPORT_INBOX ?? '').trim() || SUPPORT_EMAIL];
  for (const email of new Set(to)) {
    try {
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
    } catch (e) {
      console.error(`[fulfilment] FAILED to send the hand-packing alert for ${order.ref}`, e instanceof Error ? e.message : e);
    }
  }
}
