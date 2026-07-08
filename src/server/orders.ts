import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { assertCanViewAsset } from '@/authz';
import { assets, memberships, orderItemArtwork, orderItems, orders, printTemplates, productVariantProviders, productVariants, storageObjects } from '@/db/schema';
import { createCheckoutSession, isStripeConfigured } from '@/payments/stripe';
import { normalizeCushionBack } from '@/lib/catalogue-view';
import { screenCardMessage, type ScreenedCardMessage } from '@/server/textSafety';
import { clampQty, inCatalogue, quote, type JoinProvenance } from '@/pricing';
import { clampTransform, type RawTransform } from '@/server/print/geometry';
import type { DbHandle, Tx } from './db';
import { resolveViewerContext } from './assets';
import { getCatalogue, resolveVariantIdsByKey } from './catalogue';

function newRef(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return `SNK-${n.toString().padStart(6, '0')}`;
}

/** A basket line as it reaches the server: a product key + qty, optionally a
 * personalised placement (a kept keepsake + its transform). Prices + variant +
 * print geometry are all resolved server-side; the client supplies none of them. */
export interface PlaceLine {
  productKey: string;
  qty: number;
  artwork?: { assetId: string; transform: RawTransform; sourceObjectId?: string; back?: string; message?: unknown };
}

export interface PlaceOrderResult {
  ok: boolean;
  reason?: 'empty';
  ref?: string;
  checkoutUrl?: string;
}

/**
 * Place an order. The total is computed SERVER-SIDE from the catalogue + the
 * account's real join provenance — the client's items are just keys + quantities.
 * With Stripe configured we return a Checkout URL (the webhook later marks it
 * paid); without it (local dev) we mark it paid immediately so the loop is
 * walkable. Card data never touches our server either way.
 */
export async function placeOrder(
  db: DbHandle,
  input: {
    items: PlaceLine[];
    gift?: boolean;
    /** The buyer (null for a guest) and their server-resolved join provenance —
     * resolved by the caller (the action) from the session, never the request. */
    account: { id: string } | null;
    joinProvenance: JoinProvenance | null;
  },
): Promise<PlaceOrderResult> {
  const { account, joinProvenance } = input;
  const catalogue = await getCatalogue(db);
  const q = quote(
    input.items.map((l) => ({ productKey: l.productKey, qty: l.qty })),
    { gift: input.gift, joinProvenance, catalogue },
  );
  if (q.lines.length === 0) return { ok: false, reason: 'empty' };

  // The valid input lines align 1:1 (same order) with the priced lines.
  const valid = input.items.filter((l) => inCatalogue(catalogue, l.productKey) && clampQty(l.qty) > 0);
  const keys = [...new Set(valid.map((l) => l.productKey))];
  // Resolve each line key (product key → default variant, or variant sku) → variant id.
  const variantByKey = await resolveVariantIdsByKey(db, keys);

  // Freeze WHAT IS BEING SOLD per variant (sku, size/colour attributes, provider SKU +
  // order-time config) onto the order line. Variant rows get re-seeded over time — a
  // supplier swap or a default move must never change the meaning of a paid order.
  const variantIds = [...new Set([...variantByKey.values()])];
  const specByVariantId = new Map<string, { sku: string; attributes: Record<string, string>; provider: string | null; providerSku: string | null; providerConfig: unknown }>();
  if (variantIds.length > 0) {
    const specRows = await db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        attributes: productVariants.attributes,
        provider: productVariantProviders.provider,
        providerSku: productVariantProviders.providerSku,
        providerConfig: productVariantProviders.providerConfig,
      })
      .from(productVariants)
      .leftJoin(productVariantProviders, eq(productVariantProviders.variantId, productVariants.id))
      .where(inArray(productVariants.id, variantIds));
    for (const r of specRows) {
      specByVariantId.set(r.id, {
        sku: r.sku,
        attributes: (r.attributes as Record<string, string>) ?? {},
        provider: r.provider ?? null,
        providerSku: r.providerSku ?? null,
        providerConfig: r.providerConfig ?? null,
      });
    }
  }

  // Pre-validate every personalised line BEFORE writing anything (authz + a frozen
  // template snapshot + a server-clamped transform). A bad placement fails here,
  // not half-way through inserting an order.
  const artworkByIndex = new Map<number, {
    assetId: string; variantId: string; controllerAccountId: string; templateSnapshot: unknown; transform: RawTransform; sourceObjectId: string | null; back: string | null; message: ScreenedCardMessage | null;
  }>();
  for (let i = 0; i < valid.length; i++) {
    const art = valid[i]!.artwork;
    if (!art) continue;
    if (!account) throw new Error('must be signed in to order a personalised item');
    const variantId = variantByKey.get(valid[i]!.productKey);
    if (!variantId) continue; // not a printable product
    const [asset] = await db.select().from(assets).where(eq(assets.id, art.assetId));
    if (!asset) throw new Error('keepsake not found');
    const viewer = await resolveViewerContext(db, account.id, asset.familyId);
    assertCanViewAsset(
      { id: asset.id, familyId: asset.familyId, uploaderAccountId: asset.uploaderAccountId, controllerAccountId: asset.controllerAccountId, visibility: asset.visibility },
      viewer,
    ); // ← the gate; throws on deny
    // Content-safety gate (D8): an un-cleared image can never reach fulfilment.
    if (asset.moderationStatus !== 'CLEAR') {
      throw new Error('keepsake is not cleared for printing');
    }
    // An orderable keepsake is a real, adopted asset (never an ephemeral draft).
    if (!asset.controllerAccountId) throw new Error('keepsake has no controller');
    const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
    if (!tpl) continue;
    // validate the source object (a bg-removed cutout) belongs to THIS asset
    let sourceObjectId: string | null = null;
    if (art.sourceObjectId) {
      const [so] = await db
        .select({ id: storageObjects.id })
        .from(storageObjects)
        .where(and(eq(storageObjects.id, art.sourceObjectId), eq(storageObjects.assetId, art.assetId)));
      if (so) sourceObjectId = so.id;
    }
    artworkByIndex.set(i, {
      assetId: art.assetId,
      variantId,
      controllerAccountId: asset.controllerAccountId,
      sourceObjectId,
      templateSnapshot: {
        printWidthMm: tpl.printWidthMm,
        printHeightMm: tpl.printHeightMm,
        bleedMm: tpl.bleedMm,
        safeInsetMm: tpl.safeInsetMm,
        requiredDpi: tpl.requiredDpi,
        printWidthPx: tpl.printWidthPx,
        printHeightPx: tpl.printHeightPx,
      },
      transform: clampTransform(art.transform), // server-authoritative
      back: normalizeCushionBack(art.back), // coerced to a known token or null
      message: (() => {
        // Card inside message — SCREENED here (abuse) + normalised (trim/cap/font) before it can be
        // frozen or printed. A flagged field fails the whole order with a friendly, actionable error.
        const screen = screenCardMessage(art.message as Parameters<typeof screenCardMessage>[0]);
        if (!screen.ok) throw new Error(`your card ${screen.field} can’t be printed — please reword it`);
        return screen.value;
      })(),
    });
  }

  const ref = newRef();
  const [order] = await db
    .insert(orders)
    .values({
      ref,
      accountId: account?.id ?? null,
      status: 'PENDING',
      subtotalPence: q.subtotalPence,
      deliveryPence: q.deliveryPence,
      joinSavingPence: q.joinSavingPence,
      familySetSavingPence: q.familySetSavingPence,
      totalPence: q.totalPence,
      isGift: q.gift,
    })
    .returning();

  for (let i = 0; i < q.lines.length; i++) {
    const l = q.lines[i]!;
    const variantId = variantByKey.get(l.productKey) ?? null;
    const [oi] = await db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        productKey: l.productKey,
        variantId,
        spec: variantId ? (specByVariantId.get(variantId) ?? null) : null,
        qty: l.qty,
        unitPricePence: l.unitPricePence,
        linePence: l.linePence,
      })
      .returning();
    const art = artworkByIndex.get(i);
    if (art) {
      await db.insert(orderItemArtwork).values({
        orderItemId: oi!.id,
        assetId: art.assetId,
        variantId: art.variantId,
        controllerAccountId: art.controllerAccountId,
        templateSnapshot: art.templateSnapshot,
        transform: art.transform,
        sourceObjectId: art.sourceObjectId,
        back: art.back,
        message: art.message, // screened card message (card only), or null
        status: 'PENDING',
      });
    }
  }

  if (isStripeConfigured()) {
    const session = await createCheckoutSession({
      ref,
      lines: q.lines,
      deliveryPence: q.deliveryPence,
      joinSavingPence: q.joinSavingPence,
      familySetSavingPence: q.familySetSavingPence,
    });
    await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, order!.id));
    return { ok: true, ref, checkoutUrl: session.url ?? undefined };
  }

  await markOrderPaid(db, order!.id); // dev fallback
  return { ok: true, ref };
}

/**
 * Mark an order paid and spend the one-time join saving — ATOMICALLY and idempotently.
 *
 * The PENDING→PAID flip and the join-saving spend run in ONE transaction, guarded on
 * the transition (`.where(status='PENDING')`). So a Stripe webhook retry (which finds
 * the order already PAID) can never double-spend, and a crash can't half-apply the flip.
 *
 * The PAID status IS the fulfilment enqueue (proposal/04 §6): the worker claims the
 * PENDING artwork of PAID orders. We deliberately do NOT add a separate post-flip
 * enqueue write — that's the exact double-fire footgun §6 warns about.
 */
export async function markOrderPaid(db: DbHandle, orderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(orders)
      .set({ status: 'PAID', paidAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'PENDING')))
      .returning();
    if (!updated) return; // already paid / unknown → no-op (idempotent)
    if (updated.joinSavingPence > 0 && updated.accountId) {
      await consumeJoinSaving(tx, updated.accountId);
    }
  });
}

async function consumeJoinSaving(db: DbHandle | Tx, accountId: string): Promise<void> {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.accountId, accountId),
        eq(memberships.status, 'ACTIVE'),
        eq(memberships.isOwner, false),
        isNull(memberships.joinSavingConsumedAt),
      ),
    )
    .orderBy(desc(memberships.joinedAt))
    .limit(1);
  if (m) await db.update(memberships).set({ joinSavingConsumedAt: new Date() }).where(eq(memberships.id, m.id));
}

export interface OrderSummary {
  ref: string;
  status: string;
  totalPence: number;
  createdAtISO: string;
  items: { productKey: string; qty: number; linePence: number }[];
}

export async function getOrdersForAccount(db: DbHandle, accountId: string): Promise<OrderSummary[]> {
  const rows = await db.select().from(orders).where(eq(orders.accountId, accountId)).orderBy(desc(orders.createdAt));
  const result: OrderSummary[] = [];
  for (const o of rows) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    result.push({
      ref: o.ref,
      status: o.status,
      totalPence: o.totalPence,
      createdAtISO: o.createdAt.toISOString(),
      items: items.map((i) => ({ productKey: i.productKey, qty: i.qty, linePence: i.linePence })),
    });
  }
  return result;
}
