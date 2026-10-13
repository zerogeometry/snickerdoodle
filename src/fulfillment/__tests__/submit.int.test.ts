import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, orderItemArtwork, orderItems, orders, productVariantProviders, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { processFulfilment } from '@/fulfillment/worker';
import { assertProdigiConfigConsistent, redactUrls, releaseBlockedArtwork, resolveShippingMethod, submitReadyOrders, syncSubmittedOrders } from '@/fulfillment/submit';
import type { CreateOrderRequest, ProdigiOrder, ProdigiOrderTransport } from '@/server/prodigi/orders';
import { deleteObject } from '@/storage';
import type { GateEnv } from '@/fulfillment/gate';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };
const src = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 90, g: 160, b: 200 } } }).png().toBuffer();

// The shipping-method rule is pure — test it without a DB.
describe('resolveShippingMethod', () => {
  it('Express when any line is a jigsaw (its Express cost is baked into the price)', () => {
    expect(resolveShippingMethod(['kidsTee', 'jigsaw-110pieces'])).toBe('Express');
    expect(resolveShippingMethod(['jigsaw'])).toBe('Express');
  });
  it('Standard otherwise (garments, prints, the family set)', () => {
    expect(resolveShippingMethod(['kidsTee-34years-white', 'adultTee', 'babyBodysuit'])).toBe('Standard');
    expect(resolveShippingMethod(['framedPrint'])).toBe('Standard');
  });
});

describe('redactUrls — provider text never carries a bearer URL into the DB or logs', () => {
  it('redacts whole urls, keeping the diagnostic code', () => {
    const s = 'items.assets.FailedToDownloaded https://minio.local/prints/abc.png?X-Amz-Signature=SECRET expired';
    expect(redactUrls(s)).toBe('items.assets.FailedToDownloaded [url redacted] expired');
    expect(redactUrls(s)).not.toMatch(/X-Amz|http/i);
  });
});

describe('assertProdigiConfigConsistent — POD_MODE and the transport host must agree', () => {
  const prevBase = process.env.PRODIGI_BASE_URL;
  afterAll(() => {
    if (prevBase === undefined) delete process.env.PRODIGI_BASE_URL;
    else process.env.PRODIGI_BASE_URL = prevBase;
  });

  it('SANDBOX mode + sandbox host → ok; LIVE + live host → ok', () => {
    process.env.PRODIGI_BASE_URL = 'https://api.sandbox.prodigi.com/v4.0';
    expect(() => assertProdigiConfigConsistent({ podMode: 'SANDBOX', lg3SignedOff: false })).not.toThrow();
    process.env.PRODIGI_BASE_URL = 'https://api.prodigi.com/v4.0';
    expect(() => assertProdigiConfigConsistent({ podMode: 'LIVE', lg3SignedOff: true })).not.toThrow();
  });

  it('SANDBOX mode + LIVE host → throws (would create real, billable orders)', () => {
    process.env.PRODIGI_BASE_URL = 'https://api.prodigi.com/v4.0';
    expect(() => assertProdigiConfigConsistent({ podMode: 'SANDBOX', lg3SignedOff: false })).toThrow(/split-brain/);
  });

  it('LIVE mode + sandbox host → throws (orders would never fulfil)', () => {
    process.env.PRODIGI_BASE_URL = 'https://api.sandbox.prodigi.com/v4.0';
    expect(() => assertProdigiConfigConsistent({ podMode: 'LIVE', lg3SignedOff: true })).toThrow(/split-brain/);
  });
});

/** A fake Prodigi transport: records every payload, never touches the network. */
function fakeTransport(overrides?: { getOrder?: (id: string) => ProdigiOrder }) {
  const created: CreateOrderRequest[] = [];
  const transport: ProdigiOrderTransport & { created: CreateOrderRequest[] } = {
    created,
    async createOrder(req) {
      created.push(req);
      return { outcome: 'created', order: { id: `ord_fake_${created.length}`, status: { stage: 'InProgress' } } };
    },
    async getOrder(id) {
      if (overrides?.getOrder) return overrides.getOrder(id);
      return {
        id,
        status: { stage: 'Complete' },
        shipments: [{ id: 'shp_1', carrier: { name: 'Royal Mail' }, tracking: { number: 'TRK123', url: 'https://track.example/TRK123' } }],
      };
    },
  };
  return transport;
}

describe.skipIf(!DB || !S3)('POD submission — gate → frozen spec → exactly-once → sync (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const keys: string[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // dev mark-paid fallback → PAID orders to claim
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

  async function paidOrder(productKey: string, kind: 'DRAWING' | 'PHOTO' = 'DRAWING') {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind, buffer: await src(3000, 4200), keptInHome: true });
    // Test art: under G11 only an explicitly brand-safe fixture may reach the POD sandbox;
    // these suites use DRAWING = brand-safe test art and PHOTO = a child's image.
    if (kind === 'DRAWING') await db.update(schema.assets).set({ isBrandSafeFixture: true }).where(eq(schema.assets.id, ing.assetId));
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    const res = await placeOrder(db, {
      items: [{ productKey, qty: 1, artwork: { assetId: ing.assetId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    const [o] = await db.select({ id: orders.id, ref: orders.ref }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    return { orderId: o!.id, ref: o!.ref, assetId: ing.assetId };
  }

  async function orderRow(orderId: string) {
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    return o!;
  }

  async function artworkOf(orderId: string) {
    const [oi] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
    const [a] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
    return a!;
  }

  // Suites share one DB, so (a) OUR ticks are scoped to OUR order (never claim other
  // suites' work — a broad 150ms poll starves their 5s timeouts), and (b) another
  // suite's broad tick may still claim OUR artwork mid-render — whoever claimed it
  // finishes in-process, so poll until READY instead of assuming our tick did the work.
  async function renderUntilReady(orderId: string, timeoutMs = 20_000) {
    const t0 = Date.now();
    for (;;) {
      await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [orderId] });
      const a = await artworkOf(orderId);
      if (a.status === 'READY' && a.printObjectId) return a;
      if (a.status === 'RENDER_FAILED') throw new Error(`render failed: ${a.renderError}`);
      if (Date.now() - t0 > timeoutMs) throw new Error(`artwork not READY in time (status ${a.status})`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  it('submits from the FROZEN sold-spec — a post-payment re-seed/mutation cannot change the payload — and syncs to SHIPPED', async () => {
    const { orderId } = await paidOrder('framedPrint');
    await renderUntilReady(orderId);

    // Sabotage the LIVE variant rows after payment (what a re-seed could do)…
    const [line] = await db.select({ variantId: orderItems.variantId, spec: orderItems.spec }).from(orderItems).where(eq(orderItems.orderId, orderId));
    const variantId = line!.variantId!;
    const [prevProvider] = await db.select().from(productVariantProviders).where(eq(productVariantProviders.variantId, variantId));
    await db.update(productVariantProviders).set({ providerSku: 'MUTATED-SKU-999' }).where(eq(productVariantProviders.variantId, variantId));
    await db.update(productVariants).set({ attributes: { size: 'MUTATED', colour: 'MUTATED' } }).where(eq(productVariants.id, variantId));

    try {
      const transport = fakeTransport();
      const summary = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
      expect(summary.submitted).toBe(1);

      // …and the payload still says exactly what was SOLD.
      expect(transport.created).toHaveLength(1);
      const payload = transport.created[0]!;
      expect(payload.items[0]!.sku).toBe('GLOBAL-CFP-11X14'); // frozen providerSku, not MUTATED-SKU-999
      expect(payload.items[0]!.attributes).toEqual({ color: 'gold' }); // frozen prodigiAttrs
      expect(payload.items[0]!.sizing).toBe('fillPrintArea');
      expect(payload.items[0]!.assets[0]!.printArea).toBe('default');
      expect(payload.items[0]!.assets[0]!.url).toMatch(/^https?:\/\//); // a real provider-ingestion URL
      expect(payload.idempotencyKey).toBe(orderId);
      expect(payload.shippingMethod).toBe('Standard');
      expect(payload.recipient.address.countryCode).toBe('GB'); // sandbox placeholder (dev order has no address)

      const o = await orderRow(orderId);
      expect(o.status).toBe('FULFILLING');
      expect(o.prodigiOrderId).toBe('ord_fake_1');
      expect((await artworkOf(orderId)).status).toBe('SUBMITTED');

      // EXACTLY-ONCE: a second tick finds nothing to do (prodigiOrderId latch).
      const again = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
      expect(again.considered).toBe(0);
      expect(transport.created).toHaveLength(1);

      // SYNC: Complete at Prodigi → SHIPPED + tracking stored; artwork follows; any
      // stale submitError is cleared on the healthy terminal state.
      const sync = await syncSubmittedOrders(db, { transport, onlyOrderIds: [orderId] });
      expect(sync.shipped).toBe(1);
      const shipped = await orderRow(orderId);
      expect(shipped.status).toBe('SHIPPED');
      expect(shipped.tracking).toMatchObject({ carrier: 'Royal Mail', number: 'TRK123' });
      expect(shipped.submitError).toBeNull();
      expect((await artworkOf(orderId)).status).toBe('SHIPPED');

      // Sync is idempotent — a SHIPPED order is no longer FULFILLING.
      const syncAgain = await syncSubmittedOrders(db, { transport, onlyOrderIds: [orderId] });
      expect(syncAgain.checked).toBe(0);
    } finally {
      // Undo the sabotage so other suites see the real catalogue.
      await db.update(productVariantProviders).set({ providerSku: prevProvider!.providerSku }).where(eq(productVariantProviders.variantId, variantId));
      await db.update(productVariants).set({ attributes: { size: '11×14″', colour: 'gold' } }).where(eq(productVariants.id, variantId));
    }
  });

  it('a DOUBLE-SIDED cushion submits ONE asset to the single "default" print area (verified vs Prodigi spec)', async () => {
    // Verified against the real sandbox product spec (2026-07-10): GLOBAL-CUSH-12X12-LIN-DUAL and
    // GLOBAL-CUSH-22X22-SUE-DUAL each expose exactly { default: { required: true } } — NOT separate
    // front/back areas — and their double-sided template is 2:1 double-wide. So the renderer's
    // double-wide [front|back] file goes to the ONE 'default' area (like single-sided). See
    // project-office/briefs/DUAL-CUSHION-fulfilment.md. This locks that contract.
    const { orderId } = await paidOrder('cushion-12square-double');
    await renderUntilReady(orderId);
    const transport = fakeTransport();
    const summary = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
    expect(summary.submitted).toBe(1);
    const item = transport.created[0]!.items[0]!;
    expect(item.sku).toBe('GLOBAL-CUSH-12X12-LIN-DUAL'); // the DUAL SKU
    expect(item.assets).toHaveLength(1); // ONE asset…
    expect(item.assets[0]!.printArea).toBe('default'); // …to the single required 'default' area
  });

  it('re-asserts the GATE at the egress moment — a child image never reaches the transport', async () => {
    const { orderId, assetId } = await paidOrder('framedPrint', 'DRAWING');
    await renderUntilReady(orderId); // READY (non-child at render time)

    // The asset becomes a child image between render and submit (it's no longer a brand-safe
    // fixture — under G11 every non-fixture upload is a child's image).
    await db.update(assets).set({ isBrandSafeFixture: false }).where(eq(assets.id, assetId));

    const transport = fakeTransport();
    const summary = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
    expect(summary.blocked).toBe(1);
    expect(transport.created).toHaveLength(0); // NOTHING left the VPC — no URL, no POST
    expect((await orderRow(orderId)).status).toBe('PAID'); // not claimed
    expect((await orderRow(orderId)).prodigiOrderId).toBeNull();
    expect((await artworkOf(orderId)).status).toBe('BLOCKED_GATE'); // the state tells the truth
  });

  it('LIVE order without a shipping address fails loudly — never fabricates one', async () => {
    const { orderId } = await paidOrder('framedPrint');
    await renderUntilReady(orderId);

    const transport = fakeTransport();
    // Non-child DRAWING passes the LIVE gate; the missing address must still stop it.
    const summary = await submitReadyOrders(db, { env: { podMode: 'LIVE', lg3SignedOff: true }, transport, onlyOrderIds: [orderId] });
    expect(summary.failed).toBe(1);
    expect(transport.created).toHaveLength(0);
    const o = await orderRow(orderId);
    expect(o.status).toBe('PAID'); // still claimable after the address is fixed
    expect(o.submitError).toMatch(/shipping address/);
  });

  it('waits (without claiming) while artwork is still rendering', async () => {
    const { orderId } = await paidOrder('framedPrint');
    // Pin an in-flight state no concurrent worker tick can advance (the claim only
    // takes PENDING rows) — 'not yet rendered' itself would be a cross-suite race.
    const art = await artworkOf(orderId);
    await db.update(orderItemArtwork).set({ status: 'RENDERING' }).where(eq(orderItemArtwork.id, art.id));

    const transport = fakeTransport();
    const summary = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
    expect(summary.waiting).toBe(1);
    expect(transport.created).toHaveLength(0);
    expect((await orderRow(orderId)).status).toBe('PAID'); // untouched
  });

  it('a RENDER_FAILED line fails LOUDLY on the order (never an eternal "waiting")', async () => {
    const { orderId } = await paidOrder('framedPrint');
    const art = await artworkOf(orderId);
    await db.update(orderItemArtwork).set({ status: 'RENDER_FAILED', renderError: 'render exploded' }).where(eq(orderItemArtwork.id, art.id));

    const transport = fakeTransport();
    const summary = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
    expect(summary.failed).toBe(1);
    expect(transport.created).toHaveLength(0);
    const o = await orderRow(orderId);
    expect(o.status).toBe('PAID');
    expect(o.submitError).toMatch(/render exploded/);
    expect(o.nextSubmitAttemptAt!.getTime()).toBeGreaterThan(Date.now()); // parked, not hidden
  });

  it('recovers a stale FULFILLING claim (crash mid-submit) and re-submits in the same tick', async () => {
    const { orderId } = await paidOrder('framedPrint');
    await renderUntilReady(orderId);
    // Simulate the crash window: claimed but the prodigiOrderId write never happened.
    await db
      .update(orders)
      .set({ status: 'FULFILLING', prodigiOrderId: null, claimedAt: new Date(Date.now() - 30 * 60 * 1000) })
      .where(eq(orders.id, orderId));

    const transport = fakeTransport();
    const summary = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
    expect(summary.recovered).toBe(1);
    expect(summary.submitted).toBe(1); // swept back to PAID and submitted in one tick
    const o = await orderRow(orderId);
    expect(o.status).toBe('FULFILLING');
    expect(o.prodigiOrderId).toMatch(/^ord_fake_/);
  });

  it('a FRESH claim is NOT swept (an in-flight tick keeps its claim)', async () => {
    const { orderId } = await paidOrder('framedPrint');
    await renderUntilReady(orderId);
    await db.update(orders).set({ status: 'FULFILLING', prodigiOrderId: null, claimedAt: new Date() }).where(eq(orders.id, orderId));

    const transport = fakeTransport();
    const summary = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
    expect(summary.recovered).toBe(0);
    expect(transport.created).toHaveLength(0);
    expect((await orderRow(orderId)).status).toBe('FULFILLING'); // left alone

    // …but the sync makes it VISIBLE while it's in this state.
    const sync = await syncSubmittedOrders(db, { transport, onlyOrderIds: [orderId] });
    expect(sync.midSubmit).toBe(1);
  });

  it('DENIES BY DEFAULT when a READY line has no resolvable source asset', async () => {
    const { orderId } = await paidOrder('framedPrint');
    await renderUntilReady(orderId);
    const art = await artworkOf(orderId);
    await db.update(orderItemArtwork).set({ assetId: null }).where(eq(orderItemArtwork.id, art.id));

    const transport = fakeTransport();
    const summary = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });
    expect(summary.blocked).toBe(1);
    expect(transport.created).toHaveLength(0); // nothing left the VPC
    const o = await orderRow(orderId);
    expect(o.status).toBe('PAID');
    expect(o.submitError).toMatch(/egress denied/);
    expect((await artworkOf(orderId)).status).toBe('BLOCKED_GATE');
  });

  it('redacts presigned URLs from provider issue text before persisting', async () => {
    const { orderId } = await paidOrder('framedPrint');
    await renderUntilReady(orderId);
    let stage = 'InProgress';
    const transport = fakeTransport({
      getOrder: (id) =>
        stage === 'InProgress'
          ? {
              id,
              status: {
                stage: 'InProgress',
                issues: [{ errorCode: 'items.assets.NotDownloaded', description: 'retrying https://minio.local/prints/a.png?X-Amz-Signature=SECRET' }],
              },
            }
          : { id, status: { stage: 'Complete' }, shipments: [] },
    });
    await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId] });

    const sync = await syncSubmittedOrders(db, { transport, onlyOrderIds: [orderId] });
    expect(sync.inProgress).toBe(1);
    const o = await orderRow(orderId);
    expect(o.submitError).toMatch(/NotDownloaded/); // the diagnostic survives
    expect(o.submitError).not.toMatch(/http|X-Amz/i); // the bearer URL does not

    stage = 'Complete'; // issue resolved → shipped clears the error
    await syncSubmittedOrders(db, { transport, onlyOrderIds: [orderId] });
    expect((await orderRow(orderId)).submitError).toBeNull();
  });

  it('releases BLOCKED_GATE artwork when the gate turns green (the promised sweep)', async () => {
    const { orderId } = await paidOrder('framedPrint', 'DRAWING');
    await renderUntilReady(orderId);
    const art = await artworkOf(orderId);
    await db.update(orderItemArtwork).set({ status: 'BLOCKED_GATE', renderError: 'was blocked' }).where(eq(orderItemArtwork.id, art.id));

    const rel = await releaseBlockedArtwork(db, { env: SANDBOX, onlyOrderIds: [orderId] });
    expect(rel.released).toBe(1);
    const after = await artworkOf(orderId);
    expect(after.status).toBe('READY'); // already rendered → straight back to READY
    expect(after.renderError).toBeNull();
  });

  it('parks a manual-only order (gift wrap) out of the batch, loudly once', async () => {
    const res = await placeOrder(db, {
      items: [{ productKey: 'giftWrap', qty: 1 }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);

    const transport = fakeTransport();
    const first = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [o!.id] });
    expect(first.skipped).toBe(1);
    expect((await orderRow(o!.id)).nextSubmitAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    const second = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [o!.id] });
    expect(second.considered).toBe(0); // parked — no longer occupies the batch
  });

  it('a transport failure reverts the claim and records the error for retry', async () => {
    const { orderId } = await paidOrder('framedPrint');
    await renderUntilReady(orderId);

    const failing: ProdigiOrderTransport = {
      async createOrder() {
        throw new Error('Prodigi createOrder failed: HTTP 400 outcome=validationFailed');
      },
      async getOrder() {
        throw new Error('unused');
      },
    };
    const summary = await submitReadyOrders(db, { env: SANDBOX, transport: failing, onlyOrderIds: [orderId] });
    expect(summary.failed).toBe(1);
    const o = await orderRow(orderId);
    expect(o.status).toBe('PAID'); // claim reverted → retried later
    expect(o.prodigiOrderId).toBeNull();
    expect(o.submitError).toMatch(/validationFailed/);
    expect((await artworkOf(orderId)).status).toBe('READY'); // artwork untouched

    // BACKOFF: the failure scheduled a future attempt, so an immediate tick skips it.
    expect(o.submitAttempts).toBe(1);
    expect(o.nextSubmitAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    const again = await submitReadyOrders(db, { env: SANDBOX, transport: failing, onlyOrderIds: [orderId] });
    expect(again.considered).toBe(0);
  });
});
