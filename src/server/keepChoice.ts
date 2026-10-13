import { and, eq, inArray, isNull } from 'drizzle-orm';
import { assets, auditRecords, orderItemArtwork, orderItems, orders, storageObjects } from '@/db/schema';
import { presignDownload } from '@/storage';
import type { DbHandle } from './db';

export interface UndecidedCreation {
  assetId: string;
  imageUrl: string | null;
}

/**
 * After a purchase: the drawings on this order that the parent hasn't decided about yet — not
 * already in their keepsake box, not already declined. Only the CONTROLLING parent's own order
 * and drawings (orders.accountId + assets.controllerAccountId), never anyone else's.
 */
async function undecidedOn(db: DbHandle, accountId: string, orderRef: string) {
  const [order] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(and(eq(orders.ref, orderRef), eq(orders.accountId, accountId)));
  if (!order) return null;
  const rows = await db
    .selectDistinct({ id: assets.id, familyId: assets.familyId })
    .from(assets)
    .innerJoin(orderItemArtwork, eq(orderItemArtwork.assetId, assets.id))
    .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
    .where(and(eq(orderItems.orderId, order.id), eq(assets.controllerAccountId, accountId), eq(assets.keptInHome, false), isNull(assets.keepDeclinedAt)));
  return { order, assetIds: rows.map((r) => r.id), familyId: rows[0]?.familyId ?? null };
}

export async function listUndecidedCreations(db: DbHandle, accountId: string, orderRef: string): Promise<UndecidedCreation[]> {
  const found = await undecidedOn(db, accountId, orderRef);
  if (!found || found.assetIds.length === 0) return [];
  const objs = await db
    .select({ assetId: storageObjects.assetId, key: storageObjects.key })
    .from(storageObjects)
    .where(and(inArray(storageObjects.assetId, found.assetIds), eq(storageObjects.objectClass, 'ORIGINAL')));
  const keyOf = new Map(objs.map((o) => [o.assetId, o.key]));
  // The controller is looking at their own drawings — a short-lived link, as on Home.
  return Promise.all(found.assetIds.map(async (assetId) => ({ assetId, imageUrl: keyOf.has(assetId) ? await presignDownload(keyOf.get(assetId)!, 300) : null })));
}

/**
 * The parent's answer to "keep these in your keepsake box?".
 * - yes → kept: in the box, off the retention clock, theirs until they delete it.
 * - no  → not kept: held only as long as the order needs it (making, delivery, and the 30-day
 *         reprint window after dispatch — the normal retention clock), then erased. Recorded so
 *         we don't ask again.
 */
export async function setKeepChoice(
  db: DbHandle,
  accountId: string,
  orderRef: string,
  keep: boolean,
  now = new Date(),
): Promise<{ ok: boolean; decided: number }> {
  const found = await undecidedOn(db, accountId, orderRef);
  if (!found) return { ok: false, decided: 0 };
  if (found.assetIds.length === 0) return { ok: true, decided: 0 };

  if (keep) {
    await db.update(assets).set({ keptInHome: true, purgeAfter: null }).where(inArray(assets.id, found.assetIds));
  } else {
    await db.update(assets).set({ keepDeclinedAt: now }).where(inArray(assets.id, found.assetIds));
  }
  await db.insert(auditRecords).values({
    familyId: found.familyId,
    actorAccountId: accountId,
    actorType: 'MEMBER',
    event: 'KEEP_CHOICE_MADE',
    targetType: 'order',
    targetId: found.order.id,
    metadata: { keep, assets: found.assetIds.length },
  });

  return { ok: true, decided: found.assetIds.length };
}
