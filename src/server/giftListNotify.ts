import { and, eq } from 'drizzle-orm';
import { accounts, families, giftLinks, memberships, orderItems, orders } from '@/db/schema';
import { appUrl, sendMail } from '@/server/mail';
import type { DbHandle } from './db';

/**
 * Tell the family's parent that something on their gift list was bought — "we'll let the
 * family know and tick it off the list" is the promise made to the buyer. Sent once, on the
 * PENDING→PAID flip (markOrderPaid). Names only what the parent shared + who signed it.
 */
export async function notifyGiftListPurchase(db: DbHandle, orderId: string): Promise<void> {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o?.giftLinkId) return;
  const [link] = await db.select({ familyId: giftLinks.familyId }).from(giftLinks).where(eq(giftLinks.id, o.giftLinkId));
  if (!link) return;
  const [owner] = await db
    .select({ email: accounts.email, familyName: families.displayName })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .innerJoin(families, eq(families.id, memberships.familyId))
    .where(and(eq(memberships.familyId, link.familyId), eq(memberships.isOwner, true), eq(memberships.status, 'ACTIVE')));
  if (!owner) return;
  const lines = await db.select({ productKey: orderItems.productKey }).from(orderItems).where(eq(orderItems.orderId, o.id));
  const what = lines.length === 1 ? `a ${lines[0]!.productKey === 'framedPrint' ? 'framed print' : lines[0]!.productKey}` : `${lines.length} things`;
  const who = o.giftFromName ?? 'someone special';
  await sendMail({
    kind: 'gift-list',
    to: owner.email,
    subject: `${who} just bought ${what} from your gift list ✦`,
    text:
      `Lovely news — ${who} just bought ${what} from your gift list. We've ticked it off, so nobody doubles up.\n\n` +
      `See your list: ${appUrl('/home')}`,
  });
}
