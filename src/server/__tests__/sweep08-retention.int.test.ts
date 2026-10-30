import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as schema from '@/db/schema';
import { assets, auditRecords, orderItemArtwork, orderItems, orders, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { ABANDONED_CHECKOUT_HOURS, expireAbandonedCheckouts, purgeExpiredAssets, RETENTION_DAYS, startRetentionClockForOrder } from '@/server/retention';
import { handleStripeEvent } from '@/payments/webhook';
import { DEFAULT_STEPS, runRetention } from '@/server/jobs/retentionRun';
import type Stripe from 'stripe';
import { seedCatalogue } from '@/server/catalogue';
import { derivativeKey, putObject } from '@/storage';
import { getS3 } from '@/storage/client';
import type { DbHandle } from '@/server/db';

/**
 * Test sweep 2026-10-29 (tester 08): the retention promise end to end against real Postgres +
 * MinIO — "delete the source upload after fulfilment + 30d UNLESS kept". Checks the bucket itself
 * (every key under the asset, derivatives included), not just the DB rows.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const DAY = 86_400_000;

const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 8, b: 7 } } }).png().toBuffer();

async function keysUnder(assetId: string): Promise<string[]> {
  const { client, bucket } = getS3();
  const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `assets/${assetId}/` }));
  return (out.Contents ?? []).map((o) => o.Key!);
}

describe.skipIf(!DB || !S3)('sweep 08 — retention purge, DB + bucket', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function upload(kept: boolean) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: kept });
    // a derivative the Studio / print pipeline would have made, registered like theirs are
    const key = derivativeKey(a.assetId, 'cutout');
    await putObject(key, await png(), 'image/png');
    const { bucket } = getS3();
    await db.insert(storageObjects).values({ assetId: a.assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/png', byteSize: 1, sha256: 'x', exifStripped: true, writeOnce: true });
    return a.assetId;
  }

  async function orderFor(assetId: string, status: 'PENDING' | 'PAID' | 'SHIPPED', createdAt = new Date()) {
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    const [order] = await db
      .insert(orders)
      .values({ ref: `SNK-t8-${status}-${Math.random().toString(36).slice(2, 8)}`, accountId: ids.samId, status, subtotalPence: 100, deliveryPence: 0, totalPence: 100, createdAt })
      .returning();
    orderIds.push(order!.id);
    const [item] = await db.insert(orderItems).values({ orderId: order!.id, productKey: 'framedPrint', variantId: variant!.id, qty: 1, unitPricePence: 100, linePence: 100 }).returning();
    await db.insert(orderItemArtwork).values({ orderItemId: item!.id, assetId, variantId: variant!.id, controllerAccountId: ids.samId, templateSnapshot: {}, transform: {} });
    return order!.id;
  }

  it('an unkept upload past its window: original AND derivatives leave the bucket, rows go, purge audited', async () => {
    const id = await upload(false);
    expect((await keysUnder(id)).sort()).toEqual([`assets/${id}/derivatives/cutout`, `assets/${id}/original`]);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - 1000) }).where(eq(assets.id, id));

    const run = await purgeExpiredAssets(db);
    expect(run.purgedAssetIds).toContain(id);
    expect(await keysUnder(id)).toEqual([]);
    expect(await db.select().from(assets).where(eq(assets.id, id))).toHaveLength(0);
    expect(await db.select().from(storageObjects).where(eq(storageObjects.assetId, id))).toHaveLength(0);
    expect((await db.select().from(auditRecords).where(eq(auditRecords.targetId, id))).map((r) => r.event)).toContain('PURGE_EXECUTED');
  });

  it('a kept keepsake survives however old its order is; an unkept one still inside its window survives', async () => {
    const kept = await upload(true);
    await db.update(assets).set({ fulfilledAt: new Date(Date.now() - 400 * DAY) }).where(eq(assets.id, kept));
    const young = await upload(false); // purgeAfter = upload + 30d
    const run = await purgeExpiredAssets(db); // (never a clock far ahead: other test files share this database)
    expect(run.purgedAssetIds).not.toContain(kept);
    expect(run.purgedAssetIds).not.toContain(young);
    expect((await keysUnder(kept)).length).toBe(2);
    expect((await keysUnder(young)).length).toBe(2);
  });

  it('held while a PAID order needs it; after fulfilment the clock is fulfilment + 30d, then it goes', async () => {
    const id = await upload(false);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - DAY) }).where(eq(assets.id, id));
    const orderId = await orderFor(id, 'PAID');
    expect((await purgeExpiredAssets(db)).purgedAssetIds).not.toContain(id); // a paid order still needs it

    // shipped 29½ days ago — so the purge clock never has to run more than a couple of days ahead
    // (a purge "31 days from now" would also sweep every other test file's fresh upload in the
    // shared test database)
    const shipped = new Date(Date.now() - 29.5 * DAY);
    await db.update(orders).set({ status: 'SHIPPED' }).where(eq(orders.id, orderId));
    await startRetentionClockForOrder(db, orderId, shipped);
    const [a] = await db.select().from(assets).where(eq(assets.id, id));
    expect(a!.fulfilledAt!.getTime()).toBe(shipped.getTime());
    expect(a!.purgeAfter!.getTime()).toBe(shipped.getTime() + RETENTION_DAYS * DAY);

    expect((await purgeExpiredAssets(db)).purgedAssetIds).not.toContain(id); // 29½ days after shipping
    expect((await purgeExpiredAssets(db, { now: new Date(shipped.getTime() + 31 * DAY) })).purgedAssetIds).toContain(id); // 31
    expect(await keysUnder(id)).toEqual([]);
  });

  // 08-B2: an order that never got paid (checkout abandoned at Stripe) used to stay PENDING for ever,
  // and purgeExpiredAssets treated PENDING as "in flight" — so the unkept upload on it was never purged.
  it('08-B2: an unkept upload on a checkout abandoned 60 days ago is still purged', async () => {
    const id = await upload(false);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - 30 * DAY) }).where(eq(assets.id, id));
    await orderFor(id, 'PENDING', new Date(Date.now() - 60 * DAY));
    expect((await purgeExpiredAssets(db)).purgedAssetIds).toContain(id);
    expect(await keysUnder(id)).toEqual([]);
  });

  it('08-B2: a checkout that can still be paid (inside the Stripe session lifetime) keeps its upload; one just past it does not', async () => {
    const fresh = await upload(false);
    const stale = await upload(false);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - DAY) }).where(inArray(assets.id, [fresh, stale]));
    await orderFor(fresh, 'PENDING', new Date(Date.now() - 2 * 3_600_000)); // shopper still at Stripe
    await orderFor(stale, 'PENDING', new Date(Date.now() - (ABANDONED_CHECKOUT_HOURS + 1) * 3_600_000));
    const { purgedAssetIds } = await purgeExpiredAssets(db);
    expect(purgedAssetIds).not.toContain(fresh);
    expect(purgedAssetIds).toContain(stale);
  });

  it('08-B2: the retention job cancels abandoned checkouts (never a fresh or a paid one) and purges their unkept upload in the same run', async () => {
    const id = await upload(false);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - DAY) }).where(eq(assets.id, id));
    const abandoned = await orderFor(id, 'PENDING', new Date(Date.now() - 3 * DAY));
    const fresh = await orderFor(await upload(true), 'PENDING');
    const paid = await orderFor(await upload(true), 'PAID', new Date(Date.now() - 3 * DAY));
    // the real steps, minus the quarantine sweep (that one walks the shared local bucket)
    const report = await runRetention(db, { ...DEFAULT_STEPS, quarantine: async () => ({ deleted: 0, failed: 0 }) });
    expect(report.abandonedCheckoutsCancelled).toBeGreaterThanOrEqual(1);
    const status = async (oid: string) => (await db.select({ s: orders.status }).from(orders).where(eq(orders.id, oid)))[0]!.s;
    expect([await status(abandoned), await status(fresh), await status(paid)]).toEqual(['CANCELLED', 'PENDING', 'PAID']);
    expect(await keysUnder(id)).toEqual([]);
    // a second run finds nothing more to cancel among these
    expect(await expireAbandonedCheckouts(db)).not.toEqual(expect.arrayContaining([abandoned, fresh, paid]));
  });

  it('08-B2: Stripe’s checkout.session.expired cancels that order at once (idempotently); a paid order is never touched', async () => {
    const pending = await orderFor(await upload(false), 'PENDING');
    const paid = await orderFor(await upload(false), 'PAID');
    const sid = (n: string) => `cs_test_t8_${n}_${Math.random().toString(36).slice(2, 10)}`;
    const [s1, s2] = [sid('a'), sid('b')];
    await db.update(orders).set({ stripeSessionId: s1 }).where(eq(orders.id, pending));
    await db.update(orders).set({ stripeSessionId: s2 }).where(eq(orders.id, paid));
    const ev = (id: string, session: string) => ({ id, type: 'checkout.session.expired', data: { object: { id: session, object: 'checkout.session' } } }) as unknown as Stripe.Event;
    const evId = `evt_t8_${Math.random().toString(36).slice(2, 10)}`;
    expect(await handleStripeEvent(db, ev(evId, s1))).toEqual({ handled: true, duplicate: false });
    expect(await handleStripeEvent(db, ev(evId, s1))).toEqual({ handled: false, duplicate: true });
    expect(await handleStripeEvent(db, ev(`${evId}x`, s2))).toEqual({ handled: false, duplicate: false });
    const status = async (oid: string) => (await db.select({ s: orders.status }).from(orders).where(eq(orders.id, oid)))[0]!.s;
    expect([await status(pending), await status(paid)]).toEqual(['CANCELLED', 'PAID']);
  });
});

describe.skipIf(!DB || !S3)('sweep 08 — a mockup finishing after its keepsake is erased', () => {
  // 08-B8: persistDerivative (src/server/print/compositor.ts) writes the bytes FIRST, then the
  // storage_objects row. A mockup render that is in flight when its keepsake is erased (retention
  // purge, "delete", account closure, review "remove") lands its picture in the bucket after the
  // erase listed the rows — the row insert then fails (asset gone) and the bytes stay, untracked,
  // for ever. Seen for real in the e2e run: 5 mockup thumbnails left under a purged asset.
  it('08-B8: no picture of an erased keepsake is left in the bucket by a late mockup', async () => {
    const client = postgres(DB!, { prepare: false });
    const db = drizzle(client, { schema });
    const ids = await seedDemoFamilies(db);
    try {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
      const { deleteAsset } = await import('@/server/assets');
      const { persistDerivative } = await import('@/server/print/compositor');
      await deleteAsset(db, a.assetId, sam); // the erase…
      await persistDerivative(db, a.assetId, derivativeKey(a.assetId, 'mockup-late'), await png()).catch(() => {}); // …then the in-flight mockup lands
      expect(await keysUnder(a.assetId)).toEqual([]);
    } finally {
      await cleanupDemoFamilies(db, ids);
      await client.end();
    }
  });

  it('08-B8: a picture that landed WHILE the erase ran (no row yet) is swept from the asset’s folder too', async () => {
    const client = postgres(DB!, { prepare: false });
    const db = drizzle(client, { schema });
    const ids = await seedDemoFamilies(db);
    try {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
      await putObject(derivativeKey(a.assetId, 'mockup-mid-erase'), await png(), 'image/webp'); // bytes written, row not yet
      const { deleteAsset } = await import('@/server/assets');
      await deleteAsset(db, a.assetId, sam);
      expect(await keysUnder(a.assetId)).toEqual([]);
    } finally {
      await cleanupDemoFamilies(db, ids);
      await client.end();
    }
  });
});
