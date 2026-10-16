import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { orders, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { processFulfilment } from '@/fulfillment/worker';
import { submitReadyOrders, syncSubmittedOrders } from '@/fulfillment/submit';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * LIVE SANDBOX SMOKE — env-gated (PRODIGI_LIVE_CHECK=1): submits ONE brand-safe,
 * NON-child test image order to Prodigi's real sandbox API and asserts the payload
 * is accepted (outcome `created`, an `ord_…` id back). Sandbox never fulfils or
 * charges. Note: in local dev the asset URL points at MinIO on localhost, so
 * Prodigi's asset DOWNLOAD will later fail — this smoke validates the ORDER SHAPE,
 * not the download; a deployed environment is needed for the full loop.
 * Run:  PRODIGI_LIVE_CHECK=1 npx vitest run src/fulfillment/__tests__/sandbox-live.int.test.ts
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const GO = process.env.PRODIGI_LIVE_CHECK === '1' && Boolean(process.env.PRODIGI_API_KEY);
const SANDBOX = { podMode: 'SANDBOX' as const, lg3SignedOff: false };
const src = () => sharp({ create: { width: 3000, height: 4200, channels: 3, background: { r: 210, g: 150, b: 80 } } }).png().toBuffer();

describe.skipIf(!DB || !S3 || !GO)('Prodigi SANDBOX live smoke — one real order submission', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const keys: string[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });

  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (assetIds.length) {
      const objs = await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  it('submits a brand-safe order to the real sandbox and gets an ord_… id back', { timeout: 60_000 }, async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await src(), keptInHome: true });
    // Test art: under G11 only an explicitly brand-safe fixture may reach the POD sandbox;
    // these suites use DRAWING = brand-safe test art and PHOTO = a child's image.
    await db.update(schema.assets).set({ isBrandSafeFixture: true }).where(eq(schema.assets.id, ing.assetId));
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    const res = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: ing.assetId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);

    await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [o!.id] });

    // REAL transport (no fake) — this touches api.sandbox.prodigi.com.
    const summary = await submitReadyOrders(db, { env: SANDBOX, onlyOrderIds: [o!.id] });
    console.log('[sandbox-live] submit summary:', JSON.stringify(summary));
    expect(summary.submitted).toBe(1);

    const [after] = await db.select().from(orders).where(eq(orders.id, o!.id));
    expect(after!.status).toBe('FULFILLING');
    expect(after!.prodigiOrderId).toMatch(/^ord_/);

    const sync = await syncSubmittedOrders(db, { onlyOrderIds: [o!.id] });
    console.log('[sandbox-live] sync summary:', JSON.stringify(sync));
    expect(sync.checked).toBe(1);
  });
});
