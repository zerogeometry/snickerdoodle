import { and, eq, inArray, isNotNull, lte, ne, notExists, sql } from 'drizzle-orm';
import { assets, auditRecords, orderItemArtwork, orderItems, orders, storageObjects } from '@/db/schema';
import { deleteObjectConfirmed } from '@/storage';
import type { DbHandle, Tx } from './db';

// An order in one of these states still needs its source art (render is pending
// or in production). Once SHIPPED/CANCELLED the source follows normal retention.
const IN_FLIGHT_ORDER_STATES = ['PENDING', 'PAID', 'FULFILLING'] as const;

/** Days an un-kept upload is retained before the purge removes it (CLAUDE.md). */
export const RETENTION_DAYS = 30;

export interface PurgeSummary {
  scanned: number;
  purged: number;
  failed: number;
  purgedAssetIds: string[];
}

/**
 * The retention purge (a launch gate). Finds un-kept assets whose retention
 * window has passed and removes them for real: the stored bytes leave the
 * provider FIRST (confirmed, with retry), THEN the DB rows go (the asset delete
 * cascades its storage_objects), and a PURGE_EXECUTED audit row is appended.
 *
 * A kept keepsake (keptInHome=true, purgeAfter=null) is never touched — Postgres
 * is the source of truth for "kept". One failed asset doesn't stop the rest.
 *
 * NB: long-lived BACKUP exclusion / crypto-shredding of originals is a storage
 * policy (bucket lifecycle + backup config), enforced in infra, not here.
 */
export async function purgeExpiredAssets(
  db: DbHandle,
  opts?: { now?: Date; limit?: number },
): Promise<PurgeSummary> {
  const now = opts?.now ?? new Date();
  // Exclude any asset still referenced by an in-flight order — purging it would
  // strand a paid order with no source to render.
  const referencedByLiveOrder = db
    .select({ one: orderItemArtwork.id })
    .from(orderItemArtwork)
    .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItemArtwork.assetId, assets.id), inArray(orders.status, IN_FLIGHT_ORDER_STATES)));

  const due = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.keptInHome, false),
        isNotNull(assets.purgeAfter),
        lte(assets.purgeAfter, now),
        notExists(referencedByLiveOrder),
        // CSAM-blocked content is preserved for the runbook/report — never auto-purged.
        ne(assets.moderationStatus, 'BLOCKED'),
      ),
    )
    .limit(opts?.limit ?? 500);

  let purged = 0;
  let failed = 0;
  const purgedAssetIds: string[] = [];

  for (const asset of due) {
    try {
      const objects = await db.select().from(storageObjects).where(eq(storageObjects.assetId, asset.id));
      for (const obj of objects) {
        await deleteObjectConfirmed(obj.key); // provider, confirmed + retried
      }
      await db.delete(assets).where(eq(assets.id, asset.id)); // cascades storage_objects rows
      await db.insert(auditRecords).values({
        familyId: asset.familyId,
        actorType: 'SYSTEM',
        event: 'PURGE_EXECUTED',
        targetType: 'asset',
        targetId: asset.id,
        metadata: { reason: 'retention', purgeAfter: asset.purgeAfter?.toISOString() ?? null },
      });
      purged++;
      purgedAssetIds.push(asset.id);
    } catch {
      failed++; // leave it for the next run rather than half-deleting
    }
  }

  return { scanned: due.length, purged, failed, purgedAssetIds };
}

/**
 * Start the post-fulfilment clock (CLAUDE.md: "delete the source upload after fulfilment + 30d
 * UNLESS kept"). Called when an order reaches a terminal state (SHIPPED / CANCELLED): every
 * UN-kept source asset on it is stamped fulfilledAt = now and its purgeAfter moved to
 * now + RETENTION_DAYS — never earlier than an existing later date. A kept keepsake is untouched
 * (Postgres stays the source of truth for "kept"). Idempotent; run inside the status-change
 * transaction so the two can't drift.
 */
export async function startRetentionClockForOrder(db: DbHandle | Tx, orderId: string, now = new Date()): Promise<number> {
  const until = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);
  const onOrder = db
    .select({ assetId: orderItemArtwork.assetId })
    .from(orderItemArtwork)
    .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
    .where(and(eq(orderItems.orderId, orderId), isNotNull(orderItemArtwork.assetId)));
  const updated = await db
    .update(assets)
    .set({
      fulfilledAt: sql`coalesce(${assets.fulfilledAt}, ${now.toISOString()}::timestamptz)`,
      purgeAfter: sql`greatest(coalesce(${assets.purgeAfter}, ${until.toISOString()}::timestamptz), ${until.toISOString()}::timestamptz)`,
    })
    .where(and(inArray(assets.id, onOrder), eq(assets.keptInHome, false)))
    .returning({ id: assets.id });
  return updated.length;
}
