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
        { productKey: 'mug', qty: 2 }, // 3600
        { productKey: 'card', qty: 1 }, // 500
        { productKey: 'totally-fake', qty: 1 }, // ignored
      ],
      account: null,
      joinProvenance: null,
    });
    await track(res);
    expect(res.ok).toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    expect(order!.subtotalPence).toBe(4100); // catalogue (2×1800 + 500), not the client
    expect(order!.joinSavingPence).toBe(0);
    expect(order!.status).toBe('PAID');
  });

  it('a family set (3+ garments) earns the 5% set saving — persisted, with the sold spec frozen on each line', async () => {
    const res = await placeOrder(db, {
      items: [
        { productKey: 'kidsTee', qty: 1 }, // 2495
        { productKey: 'adultTee', qty: 1 }, // 3195
        { productKey: 'babyBodysuit', qty: 1 }, // 2195
      ],
      account: null,
      joinProvenance: null,
    });
    await track(res);
    expect(res.ok).toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    expect(order!.subtotalPence).toBe(7885);
    expect(order!.familySetSavingPence).toBe(394); // Math.round(5% of 7885)
    expect(order!.joinSavingPence).toBe(0); // guest — the two savings are independent
    expect(order!.totalPence).toBe(7885 - 394 + 0); // free delivery

    // WHAT WAS SOLD is frozen on the line — a later re-seed (price change, supplier
    // SKU swap, default move) can never change the meaning of this paid order.
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
    const adult = lines.find((l) => l.productKey === 'adultTee');
    expect(adult!.spec).toMatchObject({ sku: 'adultTee', providerSku: 'TEE-SS-STTM559' });
    expect(adult!.spec!.attributes.size).toBe('M'); // the default adult tee is the unisex M
    const baby = lines.find((l) => l.productKey === 'babyBodysuit');
    expect(baby!.spec).toMatchObject({ providerSku: 'GLOBAL-BB-RS-4411' }); // GB long-sleeve white
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
      items: [{ productKey: 'storybook', qty: 1 }], // 2595
      account: { id: ids.rosieId },
      joinProvenance: provenance,
    });
    await track(res);
    const [order] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    expect(order!.joinSavingPence).toBe(130); // Math.round(5% of 2595) = 130
    expect(order!.totalPence).toBe(2595 - 130 + 0); // free delivery

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

  it('the webhook captures the Stripe-collected shipping address BEFORE the paid-flip', async () => {
    const sessionId = `cs_ship_${ids.nonce}`;
    const [order] = await db
      .insert(orders)
      .values({ ref: `SNK-ship-${ids.nonce}`, status: 'PENDING', subtotalPence: 2495, deliveryPence: 0, totalPence: 2495, stripeSessionId: sessionId })
      .returning();
    orderIds.push(order!.id);

    const eventId = `evt_ship_${ids.nonce}`;
    webhookIds.push(eventId);
    const event = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          collected_information: {
            shipping_details: {
              name: 'Sam Hartley',
              address: { line1: '12 Meadow Way', line2: null, city: 'Bristol', postal_code: 'BS1 2AB', country: 'GB', state: null },
            },
          },
        },
      },
    } as unknown as Stripe.Event;

    await handleStripeEvent(db, event);
    const [paid] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(paid!.status).toBe('PAID');
    expect(paid!.shippingAddress).toMatchObject({
      name: 'Sam Hartley',
      line1: '12 Meadow Way',
      townOrCity: 'Bristol',
      postcode: 'BS1 2AB',
      countryCode: 'GB',
    });
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
    expect(art!.status).toBe('PENDING'); // awaiting the fulfilment worker; the PAID order is the enqueue
  });

  it('a DUAL cushion line freezes the chosen back onto the artwork (junk → null); the SKU sets sides', async () => {
    const [asset] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR' })
      .returning();
    const [dual] = await db.select().from(productVariants).where(eq(productVariants.sku, 'cushion-12square-double'));

    // The chosen back is frozen onto the artwork so the fulfilment renderer can assemble the DUAL
    // print file [front | back]. The DUAL sku itself — not the back — is what makes it two-sided.
    const backOf = async (back: string) => {
      const res = await placeOrder(db, {
        items: [{ productKey: 'cushion-12square-double', qty: 1, artwork: { assetId: asset!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, back } }],
        account: { id: ids.samId },
        joinProvenance: null,
      });
      await track(res);
      const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
      const [oi] = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
      const [art] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
      return { variantId: art!.variantId, back: art!.back };
    };

    const berry = await backOf('berry');
    expect(berry.variantId).toBe(dual!.id); // the DUAL variant (sides = double), resolved server-side
    expect(berry.back).toBe('berry'); // a real palette token is frozen verbatim

    // A forged / unknown token is coerced to null server-side — junk can never drive the print.
    expect((await backOf('not-a-real-token')).back).toBeNull();
  });

  it('a CARD line SCREENS + freezes the inside message (abuse is rejected; junk font → default)', async () => {
    const [asset] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR' })
      .returning();

    const orderCard = async (message: unknown) => {
      const res = await placeOrder(db, {
        items: [{ productKey: 'card', qty: 1, artwork: { assetId: asset!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, message } }],
        account: { id: ids.samId },
        joinProvenance: null,
      });
      await track(res);
      const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
      const [oi] = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
      const [art] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
      return art!.message as { greeting: string; message: string; signature: string; note: string; font: string; fontScale: number } | null;
    };

    // A clean message is trimmed + frozen; the 4th (note) field rides along; an unknown font token
    // normalises to the default (caveat); an out-of-range fontScale is clamped (5 → 1.4 max).
    const frozen = await orderCard({ greeting: '  Happy Birthday!  ', message: 'Have a lovely day', signature: 'love Mabel x', note: '  for you  ', font: 'not-a-font', fontScale: 5 });
    expect(frozen).toMatchObject({ greeting: 'Happy Birthday!', message: 'Have a lovely day', signature: 'love Mabel x', note: 'for you', font: 'caveat', fontScale: 1.4 });

    // All-empty (incl. the note) ⇒ null (blank inside, nothing to print). A note-only message survives.
    expect(await orderCard({ greeting: '', message: '   ', signature: '', note: '  ', font: 'gochi' })).toBeNull();
    expect(await orderCard({ greeting: '', message: '', signature: '', note: 'just a note', font: 'gochi' })).toMatchObject({ note: 'just a note', fontScale: 1 });

    // Abusive text in ANY field — including the note — fails the order LOUDLY; it can never be frozen or printed.
    await expect(orderCard({ greeting: 'hi', message: 'you fucking idiot', signature: '', note: '', font: 'baloo' })).rejects.toThrow(/can’t be printed/);
    await expect(orderCard({ greeting: 'hi', message: '', signature: '', note: 'you fucking idiot', font: 'baloo' })).rejects.toThrow(/can’t be printed/);
  });

  it('marking paid is atomic + idempotent — the PAID order is the fulfilment enqueue', async () => {
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
    expect(order!.status).toBe('PAID'); // dev fallback paid it → claimable by the worker
    const [oi] = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
    const [art1] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
    expect(art1!.status).toBe('PENDING'); // markOrderPaid never touches artwork

    // A duplicate trigger (e.g. a Stripe webhook retry) is a clean no-op.
    await markOrderPaid(db, order!.id);
    const [order2] = await db.select().from(orders).where(eq(orders.id, order!.id));
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

  it('paused add-ons (gift wrap) cannot be ordered, even by a hand-crafted request', async () => {
    const res = await placeOrder(db, { items: [{ productKey: 'giftWrap', qty: 1 }], account: { id: ids.samId }, joinProvenance: null });
    expect(res.ok).toBe(false);
  });
});
