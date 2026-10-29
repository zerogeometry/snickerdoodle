import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { assertCanViewAsset, AuthzError, canPurchaseViaGiftLink, type GiftLinkGrant } from '@/authz';
import { assets, memberships, orderItemArtwork, orderItems, orders, printTemplates, productVariantProviders, productVariants, storageObjects } from '@/db/schema';
import { createCheckoutSession, isStripeConfigured } from '@/payments/stripe';
import { normalizeCushionBack } from '@/lib/catalogue-view';
import { isGroundProduct, normalizeGround } from '@/lib/patterns';
import { expandCardPack, isCardPackKey, packSizeOf } from '@/lib/card-packs';
import { fillCalendarPages, isCalendarKey } from '@/lib/calendar';
import { BUNDLE_COMPONENT_SKUS, bundleSizeOf, expandBundle, isBundleKey, normalizeBundle, pieceOfSku } from '@/lib/christmas-bundle';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { screenCardMessage, type ScreenedCardMessage } from '@/server/textSafety';
import { clampQty, inCatalogue, quote, type JoinProvenance, type PromoRule } from '@/pricing';
import { clampTransform, templateGeom, type RawTransform } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import { getObjectBytes } from '@/storage';
import { printSourceDims } from '@/server/print/sourceDims';
import sharp from 'sharp';
import type { DbHandle, Tx } from './db';
import { resolveViewerContext } from './assets';
import { getCatalogue, resolveVariantIdsByKey } from './catalogue';
import { notifyGiftListPurchase } from './giftListNotify';
import { settlePaidOrderCredits } from './referrals';
import { sendOrderConfirmed } from './orderEmails';
import { assetRefOf } from './assetRef';

/** Pixel size of the image a line will print from (the bg-removed cutout if chosen,
 * else the ORIGINAL) — read from the stored bytes' header, in-VPC. null if unreadable,
 * in which case the renderer's own gate still applies. */
async function sourceDimensions(db: DbHandle, assetId: string, sourceObjectId: string | null): Promise<{ width: number; height: number } | null> {
  const [obj] = sourceObjectId
    ? await db.select({ key: storageObjects.key, sha256: storageObjects.sha256 }).from(storageObjects).where(eq(storageObjects.id, sourceObjectId))
    : await db
        .select({ key: storageObjects.key, sha256: storageObjects.sha256 })
        .from(storageObjects)
        .where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!obj) return null;
  try {
    const meta = await sharp(await getObjectBytes(obj.key)).metadata();
    // the REAL pixels: a Studio design enlarged for crisp stickers / words is judged as the drawing
    return meta.width && meta.height ? await printSourceDims(db, assetId, obj, { width: meta.width, height: meta.height }) : null;
  } catch {
    return null;
  }
}

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
  artwork?: { assetId: string; transform: RawTransform; sourceObjectId?: string; back?: string; ground?: string; message?: unknown; cardImageSpan?: string };
  /** A CARD PACK line only: its N cards (which drawing + placement each). Blank inside, front only. */
  cards?: Array<{ assetId: string; transform: RawTransform; sourceObjectId?: string }>;
  /** A CARD PACK line only: the pack's ONE base colour (untrusted; every card line gets it, normalised). */
  ground?: string;
  /** A CALENDAR line only: its pages in order (0 = the cover, 1–12 = January…December); a null page
   * is "not chosen" and is filled by repeating the chosen drawings (src/lib/calendar.ts). */
  pages?: Array<{ assetId: string; transform: RawTransform; sourceObjectId?: string } | null>;
  /** The CHRISTMAS BUNDLE only: its placemat drawing, its coaster drawing (or none = the placemats')
   * and a drawing per ornament (untrusted — normalised server-side; src/lib/christmas-bundle.ts). */
  bundle?: unknown;
}

export interface PlaceOrderResult {
  ok: boolean;
  reason?: 'empty' | 'too-small';
  /** For 'too-small': which line (product key) can't print well at its size. */
  productKey?: string;
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
    /** A gift-link purchase: personalised lines are authorised by the link's CAPABILITY
     * (canPurchaseViaGiftLink) instead of the buyer's membership — so a guest can buy the
     * exact keepsakes a parent shared, and nothing else. Resolved server-side from the token. */
    giftLink?: GiftLinkGrant | null;
    /** App path Stripe's "back" returns to (default: the basket). */
    cancelPath?: string;
    /** Bought through a gift link: which link (ticks items off) + who it's from (screened). */
    giftMeta?: { linkId: string; fromName: string | null } | null;
    /** A code resolved + validated server-side (resolvePromo) — never built from the request. */
    promo?: PromoRule | null;
    /** The signed-in buyer's credit balance (server-resolved from the ledger). */
    creditAvailablePence?: number;
    /** The signed-in buyer's email (referral checks); guests get theirs from Stripe at payment. */
    buyerEmail?: string | null;
  },
): Promise<PlaceOrderResult> {
  const { account, joinProvenance } = input;
  const catalogue = await getCatalogue(db);
  const q = quote(
    input.items.map((l) => ({ productKey: l.productKey, qty: l.qty, ...(isBundleKey(l.productKey) ? { bundle: l.bundle } : {}) })),
    { gift: input.gift, joinProvenance, catalogue, promo: input.promo ?? null, creditAvailablePence: account ? (input.creditAvailablePence ?? 0) : 0 },
  );
  if (q.lines.length === 0) return { ok: false, reason: 'empty' };

  // The valid input lines align 1:1 (same order) with the priced lines.
  const valid = input.items.filter((l) => inCatalogue(catalogue, l.productKey) && clampQty(l.qty) > 0);
  // (a CHRISTMAS BUNDLE is made of its pieces' own variants — each pack / ornament its own Prodigi item)
  const keys = [...new Set([...valid.map((l) => l.productKey), ...(valid.some((l) => isBundleKey(l.productKey)) ? BUNDLE_COMPONENT_SKUS : [])])];
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
  // not half-way through inserting an order. Every card of a PACK passes the very same gates.
  type PreparedArt = {
    assetId: string; variantId: string; controllerAccountId: string; templateSnapshot: unknown; transform: RawTransform; sourceObjectId: string | null; back: string | null; ground: string | null; message: ScreenedCardMessage | null; cardSpan: string | null;
  };
  const prepareArtwork = async (art: NonNullable<PlaceLine['artwork']>, productKey: string, variantId: string, opts: { blankCard?: boolean } = {}): Promise<PreparedArt | 'too-small' | null> => {
    if (!account && !input.giftLink) throw new Error('must be signed in to order a personalised item');
    const [asset] = await db.select().from(assets).where(eq(assets.id, art.assetId));
    if (!asset) throw new Error('keepsake not found');
    if (input.giftLink) {
      // Capability path: the parent's link names this keepsake (and is live) — the buyer's
      // membership is irrelevant. Content-safety is part of the capability check (D8).
      const decision = canPurchaseViaGiftLink(input.giftLink, asset, new Date());
      if (!decision.allowed) throw new AuthzError(decision);
    } else {
      const viewer = await resolveViewerContext(db, account!.id, asset.familyId);
      assertCanViewAsset(assetRefOf(asset), viewer); // ← the gate; throws on deny
      // Content-safety gate (D8): an un-cleared image can never reach fulfilment.
      if (asset.moderationStatus !== 'CLEAR') {
        throw new Error('keepsake is not cleared for printing');
      }
    }
    // An orderable keepsake is a real, adopted asset (never an ephemeral draft).
    if (!asset.controllerAccountId) throw new Error('keepsake has no controller');
    const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
    if (!tpl) return null;
    // validate the source object (a bg-removed cutout) belongs to THIS asset
    let sourceObjectId: string | null = null;
    if (art.sourceObjectId) {
      const [so] = await db
        .select({ id: storageObjects.id })
        .from(storageObjects)
        .where(and(eq(storageObjects.id, art.sourceObjectId), eq(storageObjects.assetId, art.assetId)));
      if (so) sourceObjectId = so.id;
    }
    // Print-quality gate BEFORE any money moves: a placement that can't reach the
    // product's DPI even with upscaling is refused here, not discovered at render time
    // after payment (the same assessment the positioner + renderer use; a repeat-pattern product
    // is judged on one motif).
    const transform = clampTransform(art.transform);
    const srcDims = await sourceDimensions(db, art.assetId, sourceObjectId);
    if (srcDims) {
      const geom = templateGeom(tpl);
      if (assessPrintResolution(geom, srcDims, transform, productKey).decision === 'BLOCK') return 'too-small';
    }
    return {
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
      transform, // server-authoritative (clamped above)
      back: normalizeCushionBack(art.back), // coerced to a known token or null
      // base colour: #rrggbb on an edge-to-edge product (incl. a card / every card of a pack), else null (white)
      ground: isGroundProduct(productKey) ? normalizeGround(art.ground) : null, // edge-to-edge products only; #rrggbb or none
      // A card in a PACK is blank inside, front only — whatever the request says.
      message: opts.blankCard
        ? null
        : (() => {
            // Card inside message — SCREENED here (abuse) + normalised (trim/cap/font) before it can be
            // frozen or printed. A flagged field fails the whole order with a friendly, actionable error.
            const screen = screenCardMessage(art.message as Parameters<typeof screenCardMessage>[0]);
            if (!screen.ok) throw new Error(`your card ${screen.field} can’t be printed — please reword it`);
            return screen.value;
          })(),
      // Card outer span — only 'full' is meaningful; anything else (incl. non-card lines) = front default.
      cardSpan: !opts.blankCard && art.cardImageSpan === 'full' ? 'full' : null,
    };
  };

  const artworkByIndex = new Map<number, PreparedArt>();
  // A card PACK line → one order line per distinct card design, at an equal share of the pack price.
  const packByIndex = new Map<number, Array<{ art: PreparedArt; qty: number; unitPricePence: number; linePence: number }>>();
  // A CALENDAR line → ONE order line carrying 13 artwork rows, one per print area (cover + months).
  const calendarByIndex = new Map<number, Array<{ art: PreparedArt; printArea: string }>>();
  // A CHRISTMAS BUNDLE line → one order line per Prodigi item (a pack, or an ornament design).
  const bundleByIndex = new Map<number, Array<{ art: PreparedArt; sku: string; variantId: string; qty: number; unitPricePence: number; linePence: number }>>();
  for (let i = 0; i < valid.length; i++) {
    const line = valid[i]!;
    const variantId = variantByKey.get(line.productKey);
    if (isBundleKey(line.productKey)) {
      if (input.giftLink) throw new Error('a bundle can’t be bought through a gift link');
      // its size is its variant (the key the SERVER priced); its drawings are normalised to exactly that size
      const n = bundleSizeOf(line.productKey);
      const b = n ? normalizeBundle(line.bundle, n) : null;
      if (!n || !b) throw new Error('a bundle needs its size and a drawing for the placemats');
      // The SERVER's priced line, re-split into its pieces — the split adds up to it exactly.
      const parts = expandBundle(q.lines[i]!.linePence, b, n);
      const byDesign = new Map<string, PreparedArt | 'too-small' | null>(); // one check per drawing per piece
      const prepared: Array<{ art: PreparedArt; sku: string; variantId: string; qty: number; unitPricePence: number; linePence: number }> = [];
      for (const part of parts) {
        const pieceVariant = variantByKey.get(part.sku);
        const piece = pieceOfSku(part.sku)!;
        if (!pieceVariant) throw new Error(`bundle piece ${part.sku} isn’t in the catalogue`);
        // Every drawing passes the very same gates as any print — authz, moderation, the DPI check
        // on THIS piece's template — at the piece's default placement, the one the builder previews.
        const k = `${pieceVariant}|${part.art.assetId}|${part.art.sourceObjectId ?? ''}`;
        if (!byDesign.has(k)) {
          byDesign.set(k, await prepareArtwork({ assetId: part.art.assetId, transform: defaultTransformFor(piece), sourceObjectId: part.art.sourceObjectId ?? undefined }, piece, pieceVariant));
        }
        const art = byDesign.get(k)!;
        if (art === 'too-small') return { ok: false, reason: 'too-small', productKey: line.productKey };
        if (!art) throw new Error(`bundle piece ${part.sku} has no print template`);
        prepared.push({ art, sku: part.sku, variantId: pieceVariant, qty: part.qty, unitPricePence: part.unitPricePence, linePence: part.linePence });
      }
      bundleByIndex.set(i, prepared);
      continue;
    }
    if (isCalendarKey(line.productKey)) {
      if (input.giftLink) throw new Error('a calendar can’t be bought through a gift link');
      if (!variantId) throw new Error('unknown calendar');
      // WHICH drawings go where is the client's (re-filled here, so 13 pages whatever it sent); every
      // page passes the very same gates as any print — authz, moderation, the per-page DPI check.
      const pages = fillCalendarPages(line.pages ?? (line.artwork ? [line.artwork] : []));
      // ONE placement per drawing: a print file is keyed by drawing + variant (render.ts), so every
      // page carrying the same drawing takes its first page's placement + cutout — the same checked art.
      const byDesign = new Map<string, PreparedArt | 'too-small' | null>(); // a repeated drawing is checked once
      const prepared: Array<{ art: PreparedArt; printArea: string }> = [];
      for (const p of pages) {
        const k = p.assetId;
        if (!byDesign.has(k)) byDesign.set(k, await prepareArtwork({ assetId: p.assetId, transform: p.transform, sourceObjectId: p.sourceObjectId ?? undefined }, line.productKey, variantId));
        const art = byDesign.get(k)!;
        if (art === 'too-small') return { ok: false, reason: 'too-small', productKey: line.productKey };
        if (!art) throw new Error('calendar has no print template');
        prepared.push({ art, printArea: p.printArea });
      }
      calendarByIndex.set(i, prepared);
      continue;
    }
    if (isCardPackKey(line.productKey)) {
      if (input.giftLink) throw new Error('a card pack can’t be bought through a gift link');
      const packSize = packSizeOf(variantId ? specByVariantId.get(variantId)?.attributes.size : null);
      if (!variantId || !packSize) throw new Error('unknown card pack');
      // Pack price = the SERVER's priced line (always qty 1); the client's cards only say WHICH drawings.
      const priced = q.lines[i]!;
      // One colour per pack: every card line carries the pack's (normalised) base colour.
      const groups = expandCardPack(priced.linePence, packSize, line.cards ?? [], line.ground);
      const prepared: Array<{ art: PreparedArt; qty: number; unitPricePence: number; linePence: number }> = [];
      for (const g of groups) {
        const art = await prepareArtwork({ assetId: g.card.assetId, transform: g.card.transform, sourceObjectId: g.card.sourceObjectId ?? undefined, ground: g.ground ?? undefined }, line.productKey, variantId, { blankCard: true });
        if (art === 'too-small') return { ok: false, reason: 'too-small', productKey: line.productKey };
        if (!art) throw new Error('card pack has no print template');
        prepared.push({ art, qty: g.qty, unitPricePence: g.unitPricePence, linePence: g.linePence });
      }
      packByIndex.set(i, prepared);
      continue;
    }
    const art = line.artwork;
    if (!art) continue;
    if (!variantId) continue; // not a printable product
    const prepared = await prepareArtwork(art, line.productKey, variantId);
    if (prepared === 'too-small') return { ok: false, reason: 'too-small', productKey: line.productKey };
    if (prepared) artworkByIndex.set(i, prepared);
  }

  const insertArtwork = async (orderItemId: string, art: PreparedArt, printArea: string | null = null) => {
    await db.insert(orderItemArtwork).values({
      orderItemId,
      printArea, // a calendar page's area; null = the one file for the whole line
      assetId: art.assetId,
      variantId: art.variantId,
      controllerAccountId: art.controllerAccountId,
      templateSnapshot: art.templateSnapshot,
      transform: art.transform,
      sourceObjectId: art.sourceObjectId,
      back: art.back,
      ground: art.ground,
      message: art.message, // screened card message (card only), or null
      cardSpan: art.cardSpan, // 'full' or null (front) — card only
      status: 'PENDING',
    });
  };

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
      parcelSavingPence: q.parcelSavingPence,
      multiBuySavingPence: q.multiBuySavingPence,
      totalPence: q.totalPence,
      isGift: q.gift,
      familyId: input.giftLink?.familyId ?? null,
      giftLinkId: input.giftMeta?.linkId ?? null,
      promoCodeId: q.promo?.applied && input.promo ? input.promo.id : null,
      promoSavingPence: q.promoSavingPence,
      partnerCommissionPence: q.partnerCommissionPence,
      creditAppliedPence: q.creditPence,
      buyerEmail: input.buyerEmail ?? null,
      giftFromName: input.giftMeta?.fromName ?? null,
    })
    .returning();

  for (let i = 0; i < q.lines.length; i++) {
    const l = q.lines[i]!;
    const variantId = variantByKey.get(l.productKey) ?? null;
    const parts = bundleByIndex.get(i);
    if (parts) {
      // The bundle's pieces, each its OWN variant (Prodigi SKU + template frozen in its spec): ONE
      // Prodigi order, one item per line, all from uk9 → one tracked parcel. Lines add up to the
      // bundle's price to the penny (expandBundle).
      for (const p of parts) {
        const [bi] = await db
          .insert(orderItems)
          .values({ orderId: order!.id, productKey: p.sku, variantId: p.variantId, spec: specByVariantId.get(p.variantId) ?? null, qty: p.qty, unitPricePence: p.unitPricePence, linePence: p.linePence })
          .returning();
        await insertArtwork(bi!.id, p.art);
      }
      continue;
    }
    const pack = packByIndex.get(i);
    if (pack) {
      // N cards, one order line per design: fulfilment sends them as N cards in ONE Prodigi order,
      // and the lines add up to the pack's price to the penny (expandCardPack).
      for (const p of pack) {
        const [pi] = await db
          .insert(orderItems)
          .values({
            orderId: order!.id,
            productKey: l.productKey,
            variantId,
            spec: variantId ? (specByVariantId.get(variantId) ?? null) : null,
            qty: p.qty,
            unitPricePence: p.unitPricePence,
            linePence: p.linePence,
          })
          .returning();
        await insertArtwork(pi!.id, p.art);
      }
      continue;
    }
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
    if (art) await insertArtwork(oi!.id, art);
    // a calendar: its 13 pages, each frozen to its own print area (rendered + sent one file each)
    for (const p of calendarByIndex.get(i) ?? []) await insertArtwork(oi!.id, p.art, p.printArea);
  }

  if (isStripeConfigured()) {
    const session = await createCheckoutSession({
      ref,
      lines: q.lines,
      deliveryPence: q.deliveryPence,
      joinSavingPence: q.joinSavingPence,
      familySetSavingPence: q.familySetSavingPence,
      parcelSavingPence: q.parcelSavingPence,
      multiBuySavingPence: q.multiBuySavingPence,
      promoSavingPence: q.promoSavingPence + q.creditPence, // credit rides the same one-off coupon
      promoLabel: q.promo?.applied ? q.promo.code : undefined,
      cancelPath: input.cancelPath,
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
  const flipped = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(orders)
      .set({ status: 'PAID', paidAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'PENDING')))
      .returning();
    if (!updated) return null; // already paid / unknown → no-op (idempotent)
    if (updated.joinSavingPence > 0 && updated.accountId) {
      await consumeJoinSaving(tx, updated.accountId);
    }
    return updated;
  });
  // AFTER commit, and only on the real PENDING→PAID transition (so a webhook retry never
  // re-sends): a gift-list purchase tells the family it's been ticked off. A mail failure
  // must never undo or block the payment.
  if (flipped?.giftLinkId) {
    await notifyGiftListPurchase(db, flipped.id).catch((e) => console.error('gift-list notify failed', (e as Error).message));
  }
  // Credit spent on this order + any referral reward — settled exactly once, after commit.
  if (flipped) {
    await settlePaidOrderCredits(db, flipped.id).catch((e) => console.error('credit settle failed', (e as Error).message));
    // "we've got your order" — once, on the real transition; a mail failure never touches the payment
    await sendOrderConfirmed(db, flipped.id).catch((e) => console.error('order confirmation not sent', flipped.ref, (e as Error).message));
  }
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
  /** Carrier + tracking, once it has shipped (null for untracked post). */
  tracking: { carrier?: string | null; number?: string | null; url?: string | null } | null;
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
      tracking: o.tracking ?? null,
    });
  }
  return result;
}
