import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { AuthzError, canManageFamily, canPurchaseViaGiftLink, canViewAsset, type GiftLinkGrant, type ViewerContext } from '@/authz';
import { products, productVariants, savedDesigns } from '@/db/schema';
import { accounts, assets, auditRecords, memberships, families, giftLinks, invites, orderItemArtwork, orderItems, orders, storageObjects } from '@/db/schema';
import { containsAbusiveText } from './textSafety';
import type { JoinProvenance } from '@/pricing';
import { getCatalogue, loadCatalogue } from './catalogue';
import { composeMockup } from './print/compositor';
import sharp from 'sharp';
import { getObjectBytes, presignDownload } from '@/storage';
import type { AccessLevel, Relationship } from '@/domain/types';
import type { DbHandle } from './db';
import { createInvite } from './invites';
import { familyNameForRelatives } from './onboarding';
import { placeOrder, type PlaceOrderResult } from './orders';
import { clampTransform, type RawTransform } from './print/geometry';
import { normalizeCushionBack } from '@/lib/catalogue-view';
import { isGroundProduct, normalizeGround } from '@/lib/patterns';
import { isBundleKey } from '@/lib/christmas-bundle';
import { appUrl, sendMail } from './mail';
import { assetRefOf } from './assetRef';

/** How long a gift link works (founder, 2026-10-21: 14 days, down from 30 — a forwarded bearer link
 * shows a child's drawing for less time; Children's Code). A parent can always share a fresh one. */
export const GIFT_LINK_TTL_DAYS = 14;
const DEFAULT_GIFT_PRODUCT = 'framedPrint';
/** Products a keepsake can be shared as on a gift link: printable, on show in the shop, and
 * needing no extra buyer input (a card needs its inside message, a card pack its N drawings, a
 * calendar its 13 pages, so none of them is giftable here). */
const NOT_GIFTABLE = new Set(['card', 'cardPack', 'calendar']);

/** A frozen line in a gift link — immutable once the link is created. */
export interface GiftItem {
  assetId: string;
  /** A product key (default variant) OR, for a saved design, the exact variant sku. */
  productKey: string;
  label: string;
  unitPricePence: number;
  /** Saved-design items carry the exact placement/back the parent designed (frozen). */
  designId?: string;
  transform?: unknown;
  sourceObjectId?: string | null;
  back?: string | null;
  /** Repeat-pattern base colour token the parent chose (frozen with the design). */
  ground?: string | null;
  /** The product AS DESIGNED (06-B8): a mockup composed when the PARENT shared the link (their own
   * authz), frozen here — a DERIVATIVE of this item's asset. The preview serves it under the link's
   * capability; without one, the drawing itself. */
  mockupObjectId?: string | null;
}

export interface GiftLineInput {
  assetId: string;
  /** The line's variant sku (a product key = its default variant). */
  variantSku: string;
  transform?: unknown;
  sourceObjectId?: string | null;
  back?: string | null;
  ground?: string | null;
}

export interface CreateGiftLinkInput {
  familyId: string;
  assetIds: string[];
  /** "+ Keepsake" saved designs to include, sold exactly as designed (variant + placement). */
  designIds?: string[];
  /** Basket lines to include as they were made (Share a Wish): the exact variant + placement + cutout +
   * back + base colour. Untrusted — each is re-checked here (product live + giftable + priced, the
   * keepsake visible + kept + cleared, the placement clamped, the cutout the keepsake's own). */
  lines?: GiftLineInput[];
  title?: string | null;
  /** What the keepsakes are offered as (default framed print) — validated server-side. */
  productKey?: string | null;
  /** Optionally embed a family invite so the recipient can join (and earn the 5%). */
  invite?: { email: string; relationship: Relationship; accessLevel: AccessLevel; shareOccasions?: boolean } | null;
}

/**
 * Create a shareable gift link. Owner-only. The item list is FROZEN here from the
 * chosen keepsakes (each as a framed print) and never changes afterwards. An
 * unguessable token is minted; an optional embedded invite enables the join path.
 */
export async function createGiftLink(
  db: DbHandle,
  creator: ViewerContext,
  input: CreateGiftLinkInput,
): Promise<{ id: string; token: string }> {
  if (creator.accountId === null || !canManageFamily(creator.membership) || creator.membership!.familyId !== input.familyId) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can create a gift link' });
  }
  if (input.assetIds.length === 0 && (input.designIds?.length ?? 0) === 0 && (input.lines?.length ?? 0) === 0) {
    throw new AuthzError({ allowed: false, reason: 'pick at least one keepsake to share' });
  }

  // The product is the parent's choice but never trusted: it must be live in the shop.
  const shop = await loadCatalogue(db);
  const productKey = input.productKey ?? DEFAULT_GIFT_PRODUCT;
  const product = shop.find((p) => p.key === productKey && !NOT_GIFTABLE.has(p.key));
  if (!product) throw new AuthzError({ allowed: false, reason: 'that product can’t be shared on a gift link' });
  const priced = (await getCatalogue(db))[productKey];
  if (!priced) throw new AuthzError({ allowed: false, reason: 'that product isn’t priced' });

  // Freeze a snapshot from the chosen keepsakes the creator can actually see + has kept.
  const rows = await db.select().from(assets).where(inArray(assets.id, input.assetIds));
  const items: GiftItem[] = [];
  for (const a of rows) {
    if (a.familyId !== input.familyId) continue;
    if (!a.keptInHome) continue;
    if (!canViewAsset(assetRefOf(a), creator).allowed) {
      continue;
    }
    // A gift link is shared OUTSIDE the family (token, no membership) — only fully
    // content-cleared art may be snapshotted into it (D8). Never share FLAGGED/BLOCKED.
    if (a.moderationStatus !== 'CLEAR') continue;
    items.push({
      assetId: a.id,
      productKey,
      label: product.label,
      unitPricePence: priced.pricePence,
    });
  }
  // Saved designs: the creator's own, in this family, on a live giftable product, art still
  // kept + cleared + visible to them. Priced from the design's exact variant.
  if (input.designIds?.length) {
    const designs = await db
      .select({ d: savedDesigns, a: assets, v: productVariants, p: products })
      .from(savedDesigns)
      .innerJoin(assets, eq(assets.id, savedDesigns.assetId))
      .innerJoin(productVariants, eq(productVariants.sku, savedDesigns.variantSku))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(inArray(savedDesigns.id, input.designIds), eq(savedDesigns.createdByAccountId, creator.accountId!)));
    const prices = await getCatalogue(db);
    for (const { d, a, v, p } of designs) {
      if (d.familyId !== input.familyId || a.familyId !== input.familyId || !a.keptInHome || a.moderationStatus !== 'CLEAR') continue;
      if (!canViewAsset(assetRefOf(a), creator).allowed) continue;
      if (!p.visibleInShop || !p.active || !v.active || NOT_GIFTABLE.has(p.key) || !prices[v.sku]) continue;
      const attrs = (v.attributes as Record<string, string>) ?? {};
      const detail = [attrs.size, attrs.colour].filter(Boolean).join(' · ');
      items.push({
        assetId: a.id,
        productKey: v.sku,
        label: detail ? `${p.label} · ${detail}` : p.label,
        unitPricePence: prices[v.sku]!.pricePence,
        designId: d.id,
        transform: d.transform,
        sourceObjectId: d.sourceObjectId,
        back: d.back,
        ground: d.ground,
      });
    }
  }
  // Basket lines (Share a Wish): sold as they were made — never swapped for the default product.
  if (input.lines?.length) {
    const lineRows = await db.select().from(assets).where(inArray(assets.id, input.lines.map((l) => l.assetId)));
    const byId = new Map(lineRows.map((a) => [a.id, a]));
    const variants = await db
      .select({ v: productVariants, p: products })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.sku, input.lines.map((l) => String(l.variantSku))));
    const bySku = new Map(variants.map((r) => [r.v.sku, r]));
    const prices = await getCatalogue(db);
    const seen = new Set(items.map((i) => `${i.assetId}|${i.productKey}`));
    for (const l of input.lines) {
      const a = byId.get(l.assetId);
      const row = bySku.get(String(l.variantSku));
      if (!a || !row) continue;
      const { v, p } = row;
      if (a.familyId !== input.familyId || !a.keptInHome || a.moderationStatus !== 'CLEAR') continue;
      if (!canViewAsset(assetRefOf(a), creator).allowed) continue;
      if (!p.visibleInShop || !p.active || !v.active || NOT_GIFTABLE.has(p.key) || isBundleKey(p.key) || !prices[v.sku]) continue;
      const key = `${a.id}|${v.sku}`;
      if (seen.has(key)) continue; // one line per keepsake-on-a-variant (the list ticks items off by it)
      seen.add(key);
      let sourceObjectId: string | null = null;
      if (l.sourceObjectId) {
        const [so] = await db
          .select({ id: storageObjects.id })
          .from(storageObjects)
          .where(and(eq(storageObjects.id, String(l.sourceObjectId)), eq(storageObjects.assetId, a.id)));
        sourceObjectId = so?.id ?? null;
      }
      const attrs = (v.attributes as Record<string, string>) ?? {};
      const detail = [attrs.size, attrs.colour].filter(Boolean).join(' · ');
      items.push({
        assetId: a.id,
        productKey: v.sku,
        label: detail ? `${p.label} · ${detail}` : p.label,
        unitPricePence: prices[v.sku]!.pricePence,
        transform: clampTransform((l.transform ?? {}) as RawTransform),
        sourceObjectId,
        back: normalizeCushionBack(typeof l.back === 'string' ? l.back : undefined),
        ground: isGroundProduct(p.key) ? normalizeGround(typeof l.ground === 'string' ? l.ground : undefined) : null,
      });
    }
  }
  if (items.length === 0) {
    throw new AuthzError({ allowed: false, reason: 'none of those keepsakes can be shared' });
  }

  // Each item's picture as the product it's offered as — composed NOW, as the parent (who may see it),
  // and frozen, so a gift-list visitor sees the mug, not just the drawing. Best effort: a product with
  // no mockup template (or any compose failure) just shows the drawing, as before.
  await freezeItemMockups(db, creator, items);

  let inviteId: string | null = null;
  if (input.invite?.email.trim()) {
    const inv = await createInvite(db, creator, {
      familyId: input.familyId,
      email: input.invite.email,
      relationship: input.invite.relationship,
      accessLevel: input.invite.accessLevel,
      shareOccasions: input.invite.shareOccasions === true,
    });
    inviteId = inv.inviteId;
  }

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + GIFT_LINK_TTL_DAYS * 86_400_000);
  const [link] = await db
    .insert(giftLinks)
    .values({ familyId: input.familyId, createdByAccountId: creator.accountId, token, title: input.title ?? null, items, inviteId, status: 'ACTIVE', expiresAt })
    .returning();

  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: creator.accountId,
    actorType: 'MEMBER',
    event: 'GIFT_LINK_CREATED',
    targetType: 'gift_link',
    targetId: link!.id,
    metadata: { items: items.length, hasInvite: inviteId !== null },
  });

  return { id: link!.id, token };
}

export type GiftLinkView =
  | { state: 'not-found' }
  | { state: 'revoked' }
  | { state: 'expired' }
  | { state: 'gone' } // a source keepsake was deleted
  | {
      state: 'active';
      id: string;
      /** Server-side only (never rendered): used to scope the join saving to this family. */
      familyId: string;
      /** null ⇒ the parent hasn't named the family yet (pages use neutral wording). */
      familyName: string | null;
      title: string | null;
      inviteToken: string | null;
      /** `purchased` = already bought by someone (NEVER who — only the parent sees that). */
      items: (GiftItem & { imageUrl: string | null; purchased: boolean })[];
    };

/**
 * Resolve a gift link for the recipient. Returns a "gone" state if any source
 * keepsake has since been deleted (the frozen snapshot must never serve bytes
 * that no longer exist), and revoked/expired states accordingly.
 */
export async function getGiftLink(db: DbHandle, token: string): Promise<GiftLinkView> {
  const [link] = await db.select().from(giftLinks).where(eq(giftLinks.token, token));
  if (!link) return { state: 'not-found' };
  if (link.status === 'REVOKED') return { state: 'revoked' };
  if (link.expiresAt <= new Date()) return { state: 'expired' };

  const items = link.items as GiftItem[];
  const assetIds = items.map((i) => i.assetId);
  const present = await db.select().from(assets).where(inArray(assets.id, assetIds));
  // "gone" if a source was deleted OR is no longer content-cleared — never serve
  // uncleared/CSAM-blocked bytes to a token holder outside the family (D8).
  if (present.length < assetIds.length || present.some((a) => a.moderationStatus !== 'CLEAR')) return { state: 'gone' };

  // A keepsake the parent has since pulled back to "only me" drops off the list (and can't be
  // bought or previewed — canPurchaseViaGiftLink denies it too).
  const privateIds = new Set(present.filter((a) => a.visibility === 'ONLY_ME').map((a) => a.id));
  const shown = items.filter((i) => !privateIds.has(i.assetId));
  if (shown.length === 0) return { state: 'gone' };

  const bought = await purchasedItems(db, link.id);
  const withImages = shown.map((i) => ({
    ...i,
    // A small, re-encoded preview served through the link's own capability check — the token
    // holder never gets the original file (see giftLinkPreview).
    imageUrl: giftPreviewPath(token, i.assetId, i.mockupObjectId ? i.productKey : undefined),
    purchased: bought.has(itemKey(i)),
  }));

  const [family] = await db.select({ name: families.displayName }).from(families).where(eq(families.id, link.familyId));
  let inviteToken: string | null = null;
  if (link.inviteId) {
    const [inv] = await db.select({ token: invites.token, status: invites.status }).from(invites).where(eq(invites.id, link.inviteId));
    if (inv && inv.status === 'PENDING') inviteToken = inv.token;
  }

  return {
    state: 'active',
    id: link.id,
    familyId: link.familyId,
    familyName: familyNameForRelatives(family?.name),
    title: link.title,
    inviteToken,
    items: withImages,
  };
}

/** Where a gift link serves an item's preview (same-origin; noindex; the token is the capability).
 * `productKey` picks the item when one keepsake is on the list as two products. */
export function giftPreviewPath(token: string, assetId: string, productKey?: string): string {
  const base = `/api/gift/${encodeURIComponent(token)}/preview/${encodeURIComponent(assetId)}`;
  return productKey ? `${base}?p=${encodeURIComponent(productKey)}` : base;
}

/** Compose + freeze each item's product mockup (see GiftItem.mockupObjectId). Never throws. */
async function freezeItemMockups(db: DbHandle, creator: ViewerContext, items: GiftItem[]): Promise<void> {
  const skus = [...new Set(items.map((i) => i.productKey))];
  if (skus.length === 0) return;
  const variants = await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants).where(inArray(productVariants.sku, skus));
  const idOf = new Map(variants.map((v) => [v.sku, v.id]));
  for (const item of items) {
    const variantId = idOf.get(item.productKey);
    if (!variantId) continue;
    try {
      const res = await composeMockup(db, creator, {
        assetId: item.assetId,
        variantId,
        transform: ((item.transform as RawTransform | undefined) ?? { scale: 0 }) as RawTransform,
        size: 'thumb',
        sourceObjectId: item.sourceObjectId ?? undefined,
        ground: item.ground ?? undefined,
      });
      item.mockupObjectId = res.mockupObjectId;
    } catch {
      // no template for this product yet, or a compose failure: the drawing it is
    }
  }
}

/** Longest edge of a gift-link preview — plenty for a phone screen, nowhere near print quality. */
export const GIFT_PREVIEW_MAX_PX = 720;

/**
 * The preview a gift-link holder sees: the keepsake re-encoded small (≤720px WebP, metadata
 * stripped) — never the original. Gated by the SAME capability as buying (live link, item in the
 * frozen snapshot, same family, content-cleared, not pulled back to ONLY_ME). null ⇒ 404.
 */
export async function giftLinkPreview(db: DbHandle, token: string, assetId: string, productKey?: string | null): Promise<Buffer | null> {
  const [link] = await db.select().from(giftLinks).where(eq(giftLinks.token, token));
  if (!link) return null;
  const grant: GiftLinkGrant = {
    familyId: link.familyId,
    status: link.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED',
    expiresAt: link.expiresAt,
    assetIds: (link.items as GiftItem[]).map((i) => i.assetId),
  };
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset || !canPurchaseViaGiftLink(grant, asset, new Date()).allowed) return null;
  // the product as designed, when the link froze one (a DERIVATIVE of this very asset), else the drawing
  const item = (link.items as GiftItem[]).find((i) => i.assetId === assetId && (!productKey || i.productKey === productKey));
  const [mockup] = item?.mockupObjectId
    ? await db
        .select({ key: storageObjects.key })
        .from(storageObjects)
        .where(and(eq(storageObjects.id, item.mockupObjectId), eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'DERIVATIVE')))
    : [];
  const [obj] = mockup
    ? [mockup]
    : await db
        .select({ key: storageObjects.key })
        .from(storageObjects)
        .where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!obj) return null;
  const bytes = await getObjectBytes(obj.key);
  return sharp(bytes)
    .rotate()
    .resize({ width: GIFT_PREVIEW_MAX_PX, height: GIFT_PREVIEW_MAX_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer(); // sharp drops metadata unless asked to keep it
}

/** Revoke a gift link (owner-only). Audited. */
export async function revokeGiftLink(db: DbHandle, owner: ViewerContext, giftLinkId: string): Promise<{ ok: boolean }> {
  const [link] = await db.select().from(giftLinks).where(eq(giftLinks.id, giftLinkId));
  if (!link) return { ok: false };
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== link.familyId) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can revoke a gift link' });
  }
  await db.update(giftLinks).set({ status: 'REVOKED', revokedAt: new Date() }).where(eq(giftLinks.id, giftLinkId));
  await db.insert(auditRecords).values({
    familyId: link.familyId,
    actorAccountId: owner.accountId,
    actorType: 'MEMBER',
    event: 'GIFT_LINK_REVOKED',
    targetType: 'gift_link',
    targetId: giftLinkId,
  });
  return { ok: true };
}

/**
 * Buy a gift link's frozen snapshot — SERVER-SIDE from the token, never via the client
 * basket (which can't carry the keepsake and would sell an unprintable order). Each line
 * is the snapshotted keepsake on its snapshotted product, at the default (whole-drawing)
 * placement; price/variant/geometry are resolved by placeOrder as for any order. The
 * buyer may be a guest: authorisation is the link's capability (canPurchaseViaGiftLink,
 * re-checked per line inside placeOrder), not membership. A buyer who JOINED via the
 * link's invite gets the one-time 5% from their server-resolved join provenance.
 */
export async function placeGiftLinkOrder(
  db: DbHandle,
  input: {
    token: string;
    account: { id: string; name?: string | null; email?: string } | null;
    joinProvenance: JoinProvenance | null;
    /** How the buyer signs it ("Granny") — shown to the family's parent only. */
    fromName?: string | null;
  },
): Promise<PlaceOrderResult & { unavailable?: boolean; allBought?: boolean }> {
  const [link] = await db.select().from(giftLinks).where(eq(giftLinks.token, input.token));
  if (!link) return { ok: false, unavailable: true };
  const items = link.items as GiftItem[];
  const grant: GiftLinkGrant = {
    familyId: link.familyId,
    status: link.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED',
    expiresAt: link.expiresAt,
    assetIds: items.map((i) => i.assetId),
  };
  if (grant.status !== 'ACTIVE' || grant.expiresAt <= new Date()) return { ok: false, unavailable: true };

  // The list keeps tabs: anything already bought is ticked off and not sold again.
  const bought = await purchasedItems(db, link.id);
  const privateRows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(inArray(assets.id, grant.assetIds as string[]), eq(assets.visibility, 'ONLY_ME')));
  const privateIds = new Set(privateRows.map((r) => r.id));
  const remaining = items.filter((i) => !bought.has(itemKey(i)) && !privateIds.has(i.assetId));
  if (remaining.length === 0) return { ok: false, allBought: true };

  // Only honour a join saving earned in THIS link's family (not another family's invite).
  const joinProvenance = input.joinProvenance?.invite?.familyId === link.familyId ? input.joinProvenance : null;

  try {
    return await placeOrder(db, {
      // Saved designs are sold exactly as designed; plain keepsakes at the whole-drawing default.
      items: remaining.map((i) => ({
        productKey: i.productKey,
        qty: 1,
        artwork: {
          assetId: i.assetId,
          transform: (i.transform as RawTransform | undefined) ?? { scale: 0 },
          sourceObjectId: i.sourceObjectId ?? undefined,
          back: i.back ?? undefined,
          ground: i.ground ?? undefined,
        },
      })),
      gift: true,
      account: input.account,
      joinProvenance,
      giftLink: grant,
      cancelPath: `/g/${input.token}`,
      giftMeta: { linkId: link.id, fromName: screenFromName(input.fromName) ?? defaultFromName(input.account) },
    });
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false, unavailable: true };
    throw e;
  }
}

/** A gift-list line's identity within its link: the keepsake on its product. */
function itemKey(i: { assetId: string; productKey: string }): string {
  return `${i.assetId}|${i.productKey}`;
}

/** "Who's it from?" — trimmed, ≤40 chars, no abuse; else null (we fall back or stay anonymous). */
export function screenFromName(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!v || v.length > 40 || containsAbusiveText(v)) return null;
  return v;
}

function defaultFromName(account: { name?: string | null; email?: string } | null): string | null {
  if (!account) return null;
  return screenFromName(account.name) ?? screenFromName(account.email?.split('@')[0]);
}

/**
 * Which items of a gift link have been bought (a PAID-or-later order placed through the link),
 * with who it's from and when. The list "keeps tabs" from this — no separate counter to drift.
 */
export async function purchasedItems(
  db: DbHandle,
  linkId: string,
): Promise<Map<string, { fromName: string | null; at: Date }>> {
  const rows = await db
    .select({
      assetId: orderItemArtwork.assetId,
      productKey: orderItems.productKey,
      fromName: orders.giftFromName,
      paidAt: orders.paidAt,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(orderItemArtwork, eq(orderItemArtwork.orderItemId, orderItems.id))
    .where(and(eq(orders.giftLinkId, linkId), inArray(orders.status, ['PAID', 'FULFILLING', 'SHIPPED'])));
  const out = new Map<string, { fromName: string | null; at: Date }>();
  for (const r of rows) {
    if (!r.assetId) continue;
    const k = itemKey({ assetId: r.assetId, productKey: r.productKey });
    if (!out.has(k)) out.set(k, { fromName: r.fromName, at: r.paidAt ?? new Date(0) });
  }
  return out;
}

export interface OwnerGiftList {
  id: string;
  token: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  createdAtISO: string;
  items: { assetId: string; label: string; imageUrl: string | null; boughtBy: string | null; bought: boolean }[];
}

/**
 * The parent's view of their gift lists: every item, and — for the parent ONLY — a sticker
 * saying who bought it. Owner-only (the same check as creating a link).
 */
export async function listGiftListsForOwner(db: DbHandle, owner: ViewerContext, familyId: string): Promise<OwnerGiftList[]> {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== familyId) return [];
  const links = await db.select().from(giftLinks).where(eq(giftLinks.familyId, familyId)).orderBy(desc(giftLinks.createdAt)).limit(10);
  if (links.length === 0) return [];
  const allIds = [...new Set(links.flatMap((l) => (l.items as GiftItem[]).map((i) => i.assetId)))];
  const objs = await db
    .select({ assetId: storageObjects.assetId, key: storageObjects.key })
    .from(storageObjects)
    .where(and(inArray(storageObjects.assetId, allIds), eq(storageObjects.objectClass, 'ORIGINAL')));
  const keyByAsset = new Map(objs.map((o) => [o.assetId, o.key]));
  const now = new Date();
  return Promise.all(
    links.map(async (l) => {
      const bought = await purchasedItems(db, l.id);
      return {
        id: l.id,
        token: l.token,
        status: l.status === 'REVOKED' ? 'REVOKED' : l.expiresAt <= now ? 'EXPIRED' : 'ACTIVE',
        createdAtISO: l.createdAt.toISOString(),
        items: await Promise.all(
          (l.items as GiftItem[]).map(async (i) => {
            const b = bought.get(itemKey(i));
            return {
              assetId: i.assetId,
              label: i.label,
              imageUrl: keyByAsset.has(i.assetId) ? await presignDownload(keyByAsset.get(i.assetId)!, 300) : null,
              bought: !!b,
              boughtBy: b ? (b.fromName ?? 'someone special') : null,
            };
          }),
        ),
      } satisfies OwnerGiftList;
    }),
  );
}

/**
 * Send a gift request: email the link to people the parent picks — family members (by account,
 * resolved to their email server-side, ACTIVE members of THIS family only) and/or any addresses
 * typed in. Owner-only. The link itself is the same private, revocable, tick-off-able list.
 */
export async function sendGiftRequest(
  db: DbHandle,
  owner: ViewerContext,
  input: { familyId: string; linkId: string; memberAccountIds: string[]; emails: string[]; note?: string | null },
): Promise<{ sent: number }> {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== input.familyId) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can send a gift request' });
  }
  const [link] = await db.select().from(giftLinks).where(and(eq(giftLinks.id, input.linkId), eq(giftLinks.familyId, input.familyId)));
  if (!link || link.status !== 'ACTIVE') return { sent: 0 };

  const to = new Set<string>();
  if (input.memberAccountIds.length) {
    const rows = await db
      .select({ email: accounts.email })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(and(eq(memberships.familyId, input.familyId), eq(memberships.status, 'ACTIVE'), inArray(memberships.accountId, input.memberAccountIds)));
    for (const r of rows) to.add(r.email.toLowerCase());
  }
  for (const e of input.emails) {
    const v = e.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254) to.add(v);
  }
  const [fam] = await db.select({ name: families.displayName }).from(families).where(eq(families.id, input.familyId));
  const from = familyNameForRelatives(fam?.name) ?? 'your family';
  const note = screenFromName(input.note ?? null); // ≤40 chars, abuse-screened — reused for the short note
  let sent = 0;
  for (const email of [...to].slice(0, 20)) {
    await sendMail({
      kind: 'gift-list',
      to: email,
      subject: `a gift request from ${from} ✦`,
      text:
        `${from} has put together a little gift request — keepsakes made from the children's own drawings.` +
        (note ? `\n\n"${note}"` : '') +
        `\n\nHave a look (it's private, and ticks itself off so nobody doubles up):\n${appUrl(`/g/${link.token}`)}`,
    });
    sent++;
  }
  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: owner.accountId,
    actorType: 'MEMBER',
    event: 'GIFT_LINK_CREATED',
    targetType: 'gift_link',
    targetId: link.id,
    metadata: { sentTo: sent },
  });
  return { sent };
}
