import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type Stripe from 'stripe';
import * as schema from '@/db/schema';
import { assets, invites, memberships, orderItemArtwork, orderItems, orders, productVariants, webhookEvents } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getOrdersForAccount, markOrderPaid, placeOrder } from '@/server/orders';
import { seedCatalogue } from '@/server/catalogue';
import { handleStripeEvent } from '@/payments';
import type { JoinProvenance } from '@/pricing';
import type { DbHandle } from '@/server/db';

const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('orders + payments — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const webhookIds: string[] = [];

  // These tests exercise the dev "mark-paid" fallback path — force Stripe UNCONFIGURED
  // so a real STRIPE_SECRET_KEY in the dev .env can't divert placeOrder to Checkout.
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;
  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db); // needed for variant + print template on personalised lines
  });

  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds)); // cascades order_items
    if (webhookIds.length) await db.delete(webhookEvents).where(inArray(webhookEvents.id, webhookIds));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  async function track(res: { ref?: string }) {
    if (res.ref) {
      const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref));
      if (o) orderIds.push(o.id);
    }
  }

  it('guest order: server-priced from the catalogue, marked paid (dev fallback)', async () => {
    const res = await placeOrder(db, {
      items: [
        { productKey: 'mug', qty: 2 }, // 2800
        { productKey: 'card', qty: 1 }, // 400
        { productKey: 'totally-fake', qty: 1 }, // ignored
      ],
      account: null,
      joinProvenance: null,
    });
    await track(res);
    expect(res.ok).toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    expect(order!.subtotalPence).toBe(3200); // catalogue, not the client
    expect(order!.joinSavingPence).toBe(0);
    expect(order!.status).toBe('PAID');
  });

  it('a joined member earns the 5%, and it is consumed (one-time) when the order is paid', async () => {
    // Rosie is an EXTENDED member of the Hartleys from a VERIFIED invite (seed).
    const [row] = await db
      .select({ m: memberships, inv: invites })
      .from(memberships)
      .innerJoin(invites, eq(memberships.inviteId, invites.id))
      .where(eq(memberships.accountId, ids.rosieId));
    const provenance: JoinProvenance = {
      invite: {
        id: row!.inv.id,
        familyId: row!.inv.familyId,
        verified: row!.inv.status === 'VERIFIED',
        revoked: row!.inv.status === 'REVOKED',
        expiresAt: row!.inv.expiresAt.getTime(),
      },
      membership: {
        familyId: row!.m.familyId,
        status: row!.m.status,
        inviteId: row!.m.inviteId,
        isOwner: row!.m.isOwner,
        savingConsumed: row!.m.joinSavingConsumedAt !== null,
      },
      now: Date.now(),
    };

    const res = await placeOrder(db, {
      items: [{ productKey: 'storybook', qty: 1 }], // 2400
      account: { id: ids.rosieId },
      joinProvenance: provenance,
    });
    await track(res);
    const [order] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    expect(order!.joinSavingPence).toBe(120); // 5% of 2400
    expect(order!.totalPence).toBe(2400 - 120 + 399);

    // consumed: the membership now records when the saving was spent
    const [m] = await db.select().from(memberships).where(eq(memberships.id, row!.m.id));
    expect(m!.joinSavingConsumedAt).not.toBeNull();

    // it shows in the member's order history
    const history = await getOrdersForAccount(db, ids.rosieId);
    expect(history.some((o) => o.ref === res.ref)).toBe(true);
  });

  it('the Stripe webhook is idempotent: a replayed event fulfils once', async () => {
    const sessionId = `cs_idem_${ids.nonce}`;
    const [order] = await db
      .insert(orders)
      .values({ ref: `SNK-idem-${ids.nonce}`, status: 'PENDING', subtotalPence: 1400, deliveryPence: 399, totalPence: 1799, stripeSessionId: sessionId })
      .returning();
    orderIds.push(order!.id);

    const eventId = `evt_idem_${ids.nonce}`;
    webhookIds.push(eventId);
    const event = { id: eventId, type: 'checkout.session.completed', data: { object: { id: sessionId } } } as unknown as Stripe.Event;

    const first = await handleStripeEvent(db, event);
    const second = await handleStripeEvent(db, event); // replay
    expect(first).toMatchObject({ handled: true, duplicate: false });
    expect(second).toMatchObject({ duplicate: true });

    const [paid] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(paid!.status).toBe('PAID');
    const events = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    expect(events).toHaveLength(1); // recorded exactly once
  });

  it('a personalised line freezes a SERVER-CLAMPED spec into order_item_artwork', async () => {
    const [asset] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR' })
      .returning();
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));

    const res = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: asset!.id, transform: { scale: 99, offsetX: 5, offsetY: -5, rotationDeg: 44 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    await track(res);

    const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    const [oi] = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
    expect(oi!.variantId).toBe(variant!.id); // variant resolved server-side

    const [art] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
    expect(art!.assetId).toBe(asset!.id);
    expect(art!.controllerAccountId).toBe(ids.samId);
    // the client's wild transform was CLAMPED server-side (scale 99→4, offset 5→1, rotation 44→0)
    expect(art!.transform).toMatchObject({ scale: 4, offsetX: 1, offsetY: -1, rotationDeg: 0 });
    expect((art!.templateSnapshot as { requiredDpi: number }).requiredDpi).toBe(300); // template frozen
    expect(art!.status).toBe('READY'); // the paid flip ENQUEUED fulfilment (PENDING→READY)
  });

  it('paying enqueues fulfilment (artwork PENDING→READY) atomically + idempotently', async () => {
    const [asset] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR' })
      .returning();
    const res = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: asset!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    await track(res);
    const [order] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    expect(order!.status).toBe('PAID');
    const [oi] = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
    const [art1] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
    expect(art1!.status).toBe('READY'); // enqueued in the same guarded transition

    // A duplicate trigger (e.g. a Stripe webhook retry) is a no-op — the guarded
    // PENDING→PAID flip already happened, so nothing re-enqueues or double-spends.
    await markOrderPaid(db, order!.id);
    const [art2] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
    const [order2] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(art2!.status).toBe('READY');
    expect(order2!.status).toBe('PAID');
  });

  it('refuses a personalised line for a keepsake the buyer cannot see', async () => {
    const [bloomAsset] = await db
      .insert(assets)
      .values({ familyId: ids.bloomId, kind: 'DRAWING', uploaderAccountId: ids.blakeId, controllerAccountId: ids.blakeId, visibility: 'FAMILY', keptInHome: true })
      .returning();
    // Sam (Hartley) tries to order the Blooms' keepsake → gated, nothing written
    await expect(
      placeOrder(db, {
        items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: bloomAsset!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
        account: { id: ids.samId },
        joinProvenance: null,
      }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it('refuses to fulfil a personalised line whose keepsake is not content-cleared (D8)', async () => {
    const [flagged] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'FLAGGED' })
      .returning();
    await expect(
      placeOrder(db, {
        items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: flagged!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
        account: { id: ids.samId },
        joinProvenance: null,
      }),
    ).rejects.toThrow(/cleared for printing/);
  });
});
