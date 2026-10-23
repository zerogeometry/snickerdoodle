import { eq } from 'drizzle-orm';
import { accounts, orderItems, orders } from '@/db/schema';
import { CATALOGUE, formatPence, isCatalogueKey } from '@/pricing';
import { SUPPORT_EMAIL } from '@/lib/support';
import type { DbHandle } from './db';
import { appUrl, sendMail } from './mail';

/**
 * The order emails (founder, 23 Oct): "we've got it" when it's paid, "it's on its way" when it ships
 * (with tracking where there is some). Sent once each — the callers only call on the real transition
 * — and never allowed to break a payment or a status sync: a failure is logged, never thrown.
 * Replies go to support@.
 */
async function recipient(db: DbHandle, o: typeof orders.$inferSelect): Promise<{ email: string; first: string | null } | null> {
  if (o.accountId) {
    const [a] = await db.select({ email: accounts.email, name: accounts.displayName }).from(accounts).where(eq(accounts.id, o.accountId));
    if (a?.email) return { email: a.email, first: a.name?.trim().split(/\s+/)[0] || null };
  }
  return o.buyerEmail ? { email: o.buyerEmail, first: null } : null;
}

const labelOf = (key: string) => (isCatalogueKey(key) ? CATALOGUE[key].label : key);

export async function sendOrderConfirmed(db: DbHandle, orderId: string): Promise<void> {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) return;
  const to = await recipient(db, o);
  if (!to) return;
  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  await sendMail({
    kind: 'order-confirmed',
    to: to.email,
    replyTo: SUPPORT_EMAIL,
    subject: `your Snickerdoodle order ${o.ref} is confirmed`,
    text: [
      to.first ? `Hi ${to.first},` : 'Hello,',
      '',
      'Thank you — we’ve got your order, and it’s going into production. Every piece is made especially for you, in the UK.',
      '',
      `Order ${o.ref}`,
      ...lines.map((l) => `· ${labelOf(l.productKey)}${l.qty > 1 ? ` × ${l.qty}` : ''} — ${formatPence(l.linePence)}`),
      `Total ${formatPence(o.totalPence)}, delivery included`,
      '',
      'We’ll email you again when it’s on its way.',
      o.accountId ? `You can see your order any time at ${appUrl('/orders')}.` : null,
      '',
      `Need a change? Tell us straight away at ${appUrl(`/help?topic=order-change&order=${encodeURIComponent(o.ref)}#contact`)} — we can’t promise it once it’s being made, but we’ll do everything we can.`,
      '',
      '— the Snickerdoodle team',
    ]
      .filter((l) => l !== null)
      .join('\n'),
  });
}

export async function sendOrderShipped(db: DbHandle, orderId: string): Promise<void> {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) return;
  const to = await recipient(db, o);
  if (!to) return;
  const t = o.tracking;
  const tracking = t?.url
    ? `Track it here: ${t.url}`
    : t?.number
      ? `Your tracking number${t.carrier ? ` with ${t.carrier}` : ''} is ${t.number}.`
      : 'This one travels by standard post, so there’s no tracking — it should be with you very soon.';
  await sendMail({
    kind: 'order-shipped',
    to: to.email,
    replyTo: SUPPORT_EMAIL,
    subject: `your Snickerdoodle order ${o.ref} is on its way`,
    text: [
      to.first ? `Hi ${to.first},` : 'Hello,',
      '',
      `Good news — your order ${o.ref} has been made and is on its way to you.`,
      tracking,
      o.accountId ? `It’s on your orders page too: ${appUrl('/orders')}` : null,
      '',
      `Anything not right when it arrives? Tell us at ${appUrl(`/help?topic=order-problem&order=${encodeURIComponent(o.ref)}#contact`)} and we’ll put it right.`,
      '',
      '— the Snickerdoodle team',
    ]
      .filter((l) => l !== null)
      .join('\n'),
  });
}
