import { and, eq, gt, inArray, isNotNull, lte, ne, notExists, or, sql } from 'drizzle-orm';
import { assets, auditRecords, orderItemArtwork, orderItems, orders, storageObjects } from '@/db/schema';
import { assetPrefix, deleteAllUnderPrefix, deleteObjectConfirmed } from '@/storage';
import { recordErasure } from './erasureLedger';
import { forgetAssetPreviews } from './print/previewCache';
import type { DbHandle, Tx } from './db';

// An order in one of these states still needs its source art (render is pending
// or in production). Once SHIPPED/CANCELLED the source follows normal retention.
// A PENDING order is in flight only while its checkout can still be paid (08-B2).
const IN_FLIGHT_ORDER_STATES = ['PAID', 'FULFILLING'] as const;

/**
 * How long an unpaid checkout can still turn into a paid order: a Stripe Checkout Session lasts
 * 24 hours (Stripe's default; src/payments/stripe.ts doesn't change it), plus a margin for a late
 * webhook. After that an order still PENDING was abandoned — it can never be paid — so it no
 * longer shields its unkept upload from the purge, and {@link expireAbandonedCheckouts} cancels it.
 */
export const ABANDONED_CHECKOUT_HOURS = 26;
const abandonedBefore = (now: Date) => new Date(now.getTime() - ABANDONED_CHECKOUT_HOURS * 3_600_000);

/**
 * Cancel checkouts nobody paid for (08-B2): every order still PENDING past
 * {@link ABANDONED_CHECKOUT_HOURS} — or, from the Stripe webhook, the one whose session just
 * expired. Nothing was charged (credit is only spent on the PENDING→PAID flip) and the paid-flip
 * only ever moves a PENDING order, so a cancelled one can't be revived. Its unkept upload then
 * follows normal retention (its own upload + 30 days). Returns the cancelled order ids.
 */
export async function expireAbandonedCheckouts(db: DbHandle, opts: { now?: Date; stripeSessionId?: string } = {}): Promise<string[]> {
  const now = opts.now ?? new Date();
  const which = opts.stripeSessionId ? eq(orders.stripeSessionId, opts.stripeSessionId) : lte(orders.createdAt, abandonedBefore(now));
  const gone = await db
    .update(orders)
    .set({ status: 'CANCELLED' })
    .where(and(eq(orders.status, 'PENDING'), which))
    .returning({ id: orders.id });
  return gone.map((o) => o.id);
}

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
    .where(
      and(
        eq(orderItemArtwork.assetId, assets.id),
        or(
          inArray(orders.status, IN_FLIGHT_ORDER_STATES),
          // an unpaid checkout only while it can still be paid — never an abandoned one (08-B2)
          and(eq(orders.status, 'PENDING'), gt(orders.createdAt, abandonedBefore(now))),
        ),
      ),
    );

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
      await deleteAllUnderPrefix(assetPrefix(asset.id)); // anything that landed mid-purge (a late mockup, 08-B8)
      forgetAssetPreviews(asset.id); // any printed face the compositor still holds in memory
      await db.insert(auditRecords).values({
        familyId: asset.familyId,
        actorType: 'SYSTEM',
        event: 'PURGE_EXECUTED',
        targetType: 'asset',
        targetId: asset.id,
        metadata: { reason: 'retention', purgeAfter: asset.purgeAfter?.toISOString() ?? null },
      });
      await recordErasure({ kind: 'asset', id: asset.id });
      purged++;
      purgedAssetIds.push(asset.id);
    } catch (e) {
      failed++; // leave it for the next run rather than half-deleting — but say which, and why
      console.error('[retention] could not purge asset', asset.id, (e as Error)?.message ?? String(e));
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

/** How long the audit trail is kept: 6 years (the limitation period for contract claims). The DB
 * trigger enforces the same floor (migration 0034) — this constant must not be shorter. */
export const AUDIT_RETENTION_YEARS = 6;

/**
 * Drop audit rows older than the retention period. The audit trail holds ids, event names, dates
 * and counts only (no names, no content) and is our proof that we did what we said — including
 * deletions — so it outlives the data it describes, but not forever. Runs in one transaction that
 * opts in to the trigger's narrow purge exception; nothing younger can be touched.
 */
export async function purgeExpiredAuditRecords(db: DbHandle, now = new Date()): Promise<{ purged: number }> {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - AUDIT_RETENTION_YEARS);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('snickerdoodle.audit_purge', 'on', true)`);
    const gone = await tx.delete(auditRecords).where(lte(auditRecords.createdAt, cutoff)).returning({ id: auditRecords.id });
    return { purged: gone.length };
  });
}
