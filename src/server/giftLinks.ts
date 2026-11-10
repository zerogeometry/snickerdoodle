import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { AuthzError, canManageFamily, canPurchaseViaGiftLink, canViewAsset, effectiveCircle, giftLinkAudience, giftLinkShows, narrowerCircle, type GiftLinkGrant, type ViewerContext } from '@/authz';
import { products, productVariants, savedDesigns } from '@/db/schema';
import { accounts, assets, auditRecords, memberships, families, giftLinks, invites, orderItemArtwork, orderItems, orders, storageObjects } from '@/db/schema';
import { containsAbusiveText } from './textSafety';
import { screenPendingNow } from './moderation';
import type { JoinProvenance } from '@/pricing';
import { getCatalogue, loadCatalogue } from './catalogue';
import { composeMockup } from './print/compositor';
import sharp from 'sharp';
import { derivativeKey, getObjectBytes, getS3, presignDownload, putObject } from '@/storage';
import { CIRCLES, RELATIONSHIPS, type AccessLevel, type Circle, type Relationship, type VisibilityTier } from '@/domain/types';
import { circleAllowedFor, defaultCircleFor } from '@/domain/relationships';
import { memberName } from './memberName';
import type { DbHandle } from './db';
import { AlreadyInFamilyError, createInvite } from './invites';
import { familyNameForRelatives } from './onboarding';
import { placeOrder, type PlaceOrderResult } from './orders';
import { clampTransform, type RawTransform } from './print/geometry';
import { normalizeCushionBack } from '@/lib/catalogue-view';
import { isGroundProduct, normalizeGround } from '@/lib/patterns';
import { isBundleKey } from '@/lib/christmas-bundle';
import { appUrl, sendMail } from './mail';
import { assetRefOf, isHeldForReport } from './assetRef';
import { itemName } from '@/lib/product-names';

/** How long a gift link works (founder, 2026-10-21: 14 days, down from 30 — a forwarded bearer link
 * shows a child's drawing for less time; Children's Code). A parent can always share a fresh one. */
export const GIFT_LINK_TTL_DAYS = 14;
const DEFAULT_GIFT_PRODUCT = 'framedPrint';
/** Products a keepsake can be shared as on a gift link: printable, on show in the shop, and
 * needing no extra buyer input (a card needs its inside message, a card pack its N drawings, a
 * calendar its 13 pages, a multi photo frame a drawing per square, so none of them is giftable here). */
const NOT_GIFTABLE = new Set(['card', 'cardPack', 'calendar', 'multiPhotoFrame']);

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
  /**
   * WHO the link is for (D27, founder 10 Nov 2026: ONE link per person). The link only ever shows what that person's
   * circle may see, checked again every time it's opened:
   *  - a family MEMBER: their circle in this family (resolved here, never from the client; it follows them live);
   *  - someone NEW by email: the circle their embedded invite (bound to that address) would put them in, or extended
   *    when they aren't invited;
   *  - an OPEN link (copy / WhatsApp / text / the app's share sheet — we can't know who opens it): the circle the
   *    parent picked for it ("who's it for?" — founder answer C; extended unless they say otherwise).
   */
  recipient: GiftRecipient;
  /** Links made by one send share a batch (the parent's list groups them; "switch them all off"). */
  batchId?: string | null;
}

export type GiftRecipient =
  | { kind: 'member'; accountId: string }
  | { kind: 'email'; email: string; invite?: { relationship: Relationship; accessLevel: AccessLevel; shareOccasions?: boolean; circle?: Circle } | null }
  | { kind: 'open'; circle: Circle };

/** Nobody on this link may see any of the chosen keepsakes (too private for their circle). */
export class NothingToShowError extends AuthzError {
  constructor() {
    super({ allowed: false, reason: 'none of those keepsakes are shared with their circle' });
    this.name = 'NothingToShowError';
  }
}

const isEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * Create ONE person's gift link (D27). Owner-only. The item list is FROZEN here from the chosen keepsakes — only
 * those the recipient's circle may see — and never changes afterwards. An unguessable token is minted; for someone
 * new, an optional embedded invite (bound to their address) enables the join path.
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
  const audience = await resolveRecipient(db, input.familyId, input.recipient);

  // The product is the parent's choice but never trusted: it must be live in the shop.
  const shop = await loadCatalogue(db);
  const productKey = input.productKey ?? DEFAULT_GIFT_PRODUCT;
  const product = shop.find((p) => p.key === productKey && !NOT_GIFTABLE.has(p.key));
  if (!product) throw new AuthzError({ allowed: false, reason: 'that product can’t be shared on a gift link' });
  const priced = (await getCatalogue(db))[productKey];
  if (!priced) throw new AuthzError({ allowed: false, reason: 'that product isn’t priced' });

  // A keepsake whose safety check is still running in the background: finish it now (never skip it).
  await screenPendingNow(db, [...input.assetIds, ...(input.lines ?? []).map((l) => l.assetId)]);
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
        label: detail ? `${itemName(p.key, p.label)} · ${detail}` : itemName(p.key, p.label),
        unitPricePence: prices[v.sku]!.pricePence,
        designId: d.id,
        transform: d.transform,
        sourceObjectId: await freezeSourceObject(db, a.id, d.sourceObjectId), // never the live, rewritable file (06-B7)
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
        label: detail ? `${itemName(p.key, p.label)} · ${detail}` : itemName(p.key, p.label),
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
  // only what THIS person's circle may see goes on their link (D27); the rest never reaches it
  const tiers = new Map((await db.select().from(assets).where(inArray(assets.id, [...new Set(items.map((i) => i.assetId))]))).map((a) => [a.id, a]));
  const forThem = items.filter((i) => {
    const a = tiers.get(i.assetId);
    return !!a && giftLinkShows(audience.circle, a);
  });
  if (forThem.length === 0) throw new NothingToShowError();
  items.length = 0;
  items.push(...forThem);

  // Each item's picture as the product it's offered as — composed NOW, as the parent (who may see it),
  // and frozen, so a gift-list visitor sees the mug, not just the drawing. Best effort: a product with
  // no mockup template (or any compose failure) just shows the drawing, as before.
  await freezeItemMockups(db, creator, items);

  // the embedded invite is for THIS person only — bound to their own address
  let inviteId: string | null = null;
  if (input.recipient.kind === 'email' && input.recipient.invite) {
    try {
      const inv = await createInvite(db, creator, {
        familyId: input.familyId,
        email: audience.email!,
        relationship: input.recipient.invite.relationship,
        accessLevel: input.recipient.invite.accessLevel,
        shareOccasions: input.recipient.invite.shareOccasions === true,
        ...(input.recipient.invite.circle ? { circle: input.recipient.invite.circle } : {}),
      });
      inviteId = inv.inviteId;
    } catch (e) {
      if (!(e instanceof AlreadyInFamilyError)) throw e; // already in the family: the link needs no invite
    }
  }

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + GIFT_LINK_TTL_DAYS * 86_400_000);
  const [link] = await db
    .insert(giftLinks)
    .values({
      familyId: input.familyId,
      createdByAccountId: creator.accountId,
      token,
      title: input.title ?? null,
      items,
      inviteId,
      status: 'ACTIVE',
      expiresAt,
      recipientEmail: audience.email,
      recipientAccountId: audience.accountId,
      audienceCircle: audience.circle,
      batchId: input.batchId ?? null,
    })
    .returning();

  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: creator.accountId,
    actorType: 'MEMBER',
    event: 'GIFT_LINK_CREATED',
    targetType: 'gift_link',
    targetId: link!.id,
    metadata: { items: items.length, hasInvite: inviteId !== null, recipient: input.recipient.kind, circle: audience.circle, batchId: input.batchId ?? null },
  });

  return { id: link!.id, token };
}

/**
 * Whose eyes a new link shows (server-side, never the client's word for a member). A member's circle comes from
 * their ACTIVE membership here; someone new gets the circle their invite would give them (extended when they
 * aren't invited); an open link, the circle the parent picked.
 */
async function resolveRecipient(db: DbHandle, familyId: string, r: GiftRecipient): Promise<{ circle: Circle; email: string | null; accountId: string | null }> {
  if (r.kind === 'member') {
    const [m] = await db
      .select({ circle: memberships.circle, isOwner: memberships.isOwner, email: accounts.email })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(and(eq(memberships.familyId, familyId), eq(memberships.accountId, String(r.accountId)), eq(memberships.status, 'ACTIVE')));
    if (!m) throw new AuthzError({ allowed: false, reason: 'not a member of this family' });
    return { circle: effectiveCircle(m), email: m.email.toLowerCase(), accountId: String(r.accountId) };
  }
  if (r.kind === 'email') {
    const email = String(r.email ?? '').trim().toLowerCase();
    if (!isEmail(email)) throw new AuthzError({ allowed: false, reason: 'that address doesn’t look right' });
    // already a member? then it's their own member link, at their circle
    const [m] = await db
      .select({ accountId: memberships.accountId, circle: memberships.circle, isOwner: memberships.isOwner })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(and(eq(memberships.familyId, familyId), eq(memberships.status, 'ACTIVE'), sql`lower(${accounts.email}) = ${email}`));
    if (m) return { circle: effectiveCircle(m), email, accountId: m.accountId };
    const inv = r.invite;
    if (!inv) return { circle: 'EXTENDED', email, accountId: null };
    if (inv.circle !== undefined && !circleAllowedFor(inv.relationship, inv.circle)) throw new AuthzError({ allowed: false, reason: 'that circle isn’t one for them' });
    return { circle: inv.circle ?? defaultCircleFor(inv.relationship), email, accountId: null };
  }
  if (r.kind === 'open' && (CIRCLES as readonly string[]).includes(r.circle)) return { circle: r.circle, email: null, accountId: null };
  throw new AuthzError({ allowed: false, reason: 'who is the link for?' });
}

/**
 * Whose eyes a link shows NOW (null ⇒ it stops): a member's link follows their circle live (never wider than when it
 * was sent; removed → it stops). A link made before D27 (shared with many): extended.
 */
export async function liveAudience(db: DbHandle, link: { familyId: string; recipientAccountId: string | null; audienceCircle: Circle | null }): Promise<Circle | null> {
  const sent = giftLinkAudience(link);
  if (!link.recipientAccountId) return sent;
  const [m] = await db
    .select({ circle: memberships.circle, isOwner: memberships.isOwner })
    .from(memberships)
    .where(and(eq(memberships.familyId, link.familyId), eq(memberships.accountId, link.recipientAccountId), eq(memberships.status, 'ACTIVE')));
  if (!m) return null;
  return narrowerCircle(sent, effectiveCircle(m));
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
      /** whose eyes it shows (server-side only; the page never prints it) */
      audience: Circle;
      /** `purchased` = already bought by someone (NEVER who — only the parent sees that). */
      items: (GiftItem & { imageUrl: string | null; purchased: boolean })[];
    };

/**
 * A design's picture (its lifted cut-out, its Studio design) is a file that is REWRITTEN in place
 * when the drawing is lifted or edited again. A gift link must sell exactly what was shared (06-B7:
 * the snapshot is immutable), so the link gets its own write-once copy, filed under the same
 * keepsake (retention, deletion and the erasers' folder sweep cover it like any other derivative).
 * Null when the object isn't this keepsake's.
 */
async function freezeSourceObject(db: DbHandle, assetId: string, sourceObjectId: string | null): Promise<string | null> {
  if (!sourceObjectId) return null;
  const [src] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.id, sourceObjectId), eq(storageObjects.assetId, assetId)));
  if (!src) return null;
  if (src.writeOnce) return src.id; // already immutable
  const key = derivativeKey(assetId, `gift-${randomUUID()}`);
  await putObject(key, await getObjectBytes(src.key), src.contentType ?? 'image/png');
  const [row] = await db
    .insert(storageObjects)
    .values({ assetId, objectClass: 'DERIVATIVE', bucket: getS3().bucket, key, contentType: src.contentType, byteSize: src.byteSize, sha256: src.sha256, exifStripped: true, writeOnce: true })
    .returning({ id: storageObjects.id });
  return row!.id;
}

/**
 * Can a live (not revoked, not expired) link still be used, judged from its keepsakes as stored NOW?
 * ONE rule for the recipient's page and the parent's own list (06-B5), so the two never disagree:
 *  - 'gone': a keepsake on it was deleted or CSAM-blocked, or none is shared with the link's person any more
 *    (pulled back to "only me", or narrower than their circle — D27);
 *  - 'held': a keepsake on it isn't content-cleared (held after a report, or awaiting review) — the
 *    link is offline until review decides;
 *  - 'ok'.
 */
export function linkAvailability(
  assetIds: readonly string[],
  present: { id: string; moderationStatus: string; visibility: VisibilityTier; parentLimit: VisibilityTier | null }[],
  audience: Circle | null,
): 'ok' | 'held' | 'gone' {
  if (audience === null) return 'gone';
  if (present.length < new Set(assetIds).size) return 'gone';
  if (present.some((a) => a.moderationStatus === 'BLOCKED')) return 'gone';
  if (present.some((a) => a.moderationStatus !== 'CLEAR')) return 'held';
  if (!present.some((a) => giftLinkShows(audience, a))) return 'gone';
  return 'ok';
}

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
  // a member's link follows them: removed from the family → it stops (looks like a switched-off link)
  const audience = await liveAudience(db, link);
  if (audience === null) return { state: 'revoked' };
  // "gone" if a source was deleted OR is no longer content-cleared — never serve
  // uncleared/CSAM-blocked bytes to a token holder outside the family (D8). (The recipient isn't told
  // WHY: "held" and "gone" look the same from outside.)
  if (linkAvailability(assetIds, present, audience) !== 'ok') return { state: 'gone' };

  // Only what THIS link's person may see NOW (D27): a keepsake made narrower than their circle since —
  // or pulled back to "only me" — drops off (and can't be bought or previewed: canPurchaseViaGiftLink).
  const seen = new Set(present.filter((a) => giftLinkShows(audience, a)).map((a) => a.id));
  const shown = items.filter((i) => seen.has(i.assetId));

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
    audience,
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
  const audience = await liveAudience(db, link);
  if (audience === null) return null;
  const grant: GiftLinkGrant = {
    familyId: link.familyId,
    status: link.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED',
    expiresAt: link.expiresAt,
    assetIds: (link.items as GiftItem[]).map((i) => i.assetId),
    audienceCircle: audience,
  };
  // the whole link must still be usable (the same rule as the page, 06-B5): if any keepsake on it was
  // deleted or is held, no preview loads, not even for the ones still there (N7 / A-59)
  const present = await db.select().from(assets).where(inArray(assets.id, grant.assetIds));
  if (linkAvailability(grant.assetIds, present, audience) !== 'ok') return null;
  const asset = present.find((a) => a.id === assetId);
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
  // the invite inside it stops too — "turn it off" means for everyone at once (its token was shown
  // on the link). An invite already accepted is a membership now: that's changed from /family.
  if (link.inviteId) {
    const [spent] = await db
      .update(invites)
      .set({ status: 'REVOKED' })
      .where(and(eq(invites.id, link.inviteId), eq(invites.status, 'PENDING')))
      .returning({ id: invites.id });
    if (spent) {
      await db.insert(auditRecords).values({ familyId: link.familyId, actorAccountId: owner.accountId, actorType: 'MEMBER', event: 'INVITE_REVOKED', targetType: 'invite', targetId: spent.id, metadata: { reason: 'gift-link-revoked', giftLinkId } });
    }
  }
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
  const audience = await liveAudience(db, link);
  if (audience === null) return { ok: false, unavailable: true };
  const grant: GiftLinkGrant = {
    familyId: link.familyId,
    status: link.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED',
    expiresAt: link.expiresAt,
    assetIds: items.map((i) => i.assetId),
    audienceCircle: audience,
  };
  if (grant.status !== 'ACTIVE' || grant.expiresAt <= new Date()) return { ok: false, unavailable: true };

  // The list keeps tabs: anything already bought is ticked off and not sold again. And only what this link's
  // person may see now goes in the order (D27; placeOrder re-checks every line with canPurchaseViaGiftLink).
  const bought = await purchasedItems(db, link.id);
  const rowsNow = await db.select().from(assets).where(inArray(assets.id, grant.assetIds as string[]));
  const seen = new Set(rowsNow.filter((a) => giftLinkShows(audience, a)).map((r) => r.id));
  const remaining = items.filter((i) => !bought.has(itemKey(i)) && seen.has(i.assetId));
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
  /** who it was sent to (D27: one link per person) — a member's name, an address, or null for an open link */
  sentTo: string | null;
  /** the circle it shows for (null = a link made before one-per-person) */
  audience: Circle | null;
  batchId: string | null;
  /** HELD = offline while a keepsake on it is checked (after a report); GONE = a keepsake on it was
   * deleted / blocked, or all were made "only me" — the same rule the recipient's page uses (06-B5). */
  status: 'ACTIVE' | 'HELD' | 'GONE' | 'REVOKED' | 'EXPIRED';
  createdAtISO: string;
  items: { assetId: string; label: string; imageUrl: string | null; boughtBy: string | null; bought: boolean }[];
}

/**
 * The parent's view of their gift lists: every item, and — for the parent ONLY — a sticker
 * saying who bought it. Owner-only (the same check as creating a link).
 *
 * Each item's picture is re-checked NOW, item by item (07-B12): a keepsake in a link may since have
 * been made "only me" by its controller (another parent), erased, CSAM-blocked or held after a report
 * — then the list shows its label with no picture. Never a signed link to an original the owner
 * couldn't open from their own keepsake box.
 */
export async function listGiftListsForOwner(db: DbHandle, owner: ViewerContext, familyId: string): Promise<OwnerGiftList[]> {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== familyId) return [];
  const links = await db.select().from(giftLinks).where(eq(giftLinks.familyId, familyId)).orderBy(desc(giftLinks.createdAt)).limit(30);
  if (links.length === 0) return [];
  const allIds = [...new Set(links.flatMap((l) => (l.items as GiftItem[]).map((i) => i.assetId)))];
  const objs = await db
    .select({ assetId: storageObjects.assetId, key: storageObjects.key })
    .from(storageObjects)
    .where(and(inArray(storageObjects.assetId, allIds), eq(storageObjects.objectClass, 'ORIGINAL')));
  const rows = await db.select().from(assets).where(inArray(assets.id, allIds));
  const pictured = new Set(
    rows
      .filter((r) => r.moderationStatus !== 'BLOCKED' && !isHeldForReport(r) && canViewAsset(assetRefOf(r), owner).allowed)
      .map((r) => r.id),
  );
  const keyByAsset = new Map(objs.filter((o) => pictured.has(o.assetId)).map((o) => [o.assetId, o.key]));
  const now = new Date();
  const ownerStatus = (l: (typeof links)[number]): OwnerGiftList['status'] => {
    if (l.status === 'REVOKED') return 'REVOKED';
    if (l.expiresAt <= now) return 'EXPIRED';
    const ids = (l.items as GiftItem[]).map((i) => i.assetId);
    const live = linkAvailability(ids, rows.filter((r) => ids.includes(r.id)), giftLinkAudience(l));
    return live === 'ok' ? 'ACTIVE' : live === 'held' ? 'HELD' : 'GONE';
  };
  const memberIds = [...new Set(links.map((l) => l.recipientAccountId).filter((x): x is string => !!x))];
  const names = new Map(
    memberIds.length
      ? (
          await db
            .select({ id: accounts.id, displayName: accounts.displayName, email: accounts.email, relationship: memberships.relationship })
            .from(accounts)
            .innerJoin(memberships, and(eq(memberships.accountId, accounts.id), eq(memberships.familyId, familyId)))
            .where(inArray(accounts.id, memberIds))
        ).map((a) => [a.id, memberName(a, a.relationship, { byThemself: false, byParent: true })])
      : [],
  );
  return Promise.all(
    links.map(async (l) => {
      const bought = await purchasedItems(db, l.id);
      return {
        id: l.id,
        token: l.token,
        sentTo: l.recipientAccountId ? (names.get(l.recipientAccountId) ?? l.recipientEmail) : l.recipientEmail,
        audience: l.audienceCircle,
        batchId: l.batchId,
        status: ownerStatus(l),
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

/** One person a gift request goes to. */
export type GiftSendTo = { memberAccountId: string } | { email: string; relationship?: Relationship | null };

export interface SendGiftLinksInput {
  familyId: string;
  assetIds: string[];
  designIds?: string[];
  productKey?: string | null;
  title?: string | null;
  note?: string | null;
  to: GiftSendTo[];
  /** for someone new: also invite them to join (each to their own address) at this access */
  invite?: { accessLevel: AccessLevel; shareOccasions?: boolean } | null;
}

export interface GiftSendResult {
  batchId: string;
  sent: number;
  /** who got nothing because every pick is too private for their circle (named for the parent only) */
  skipped: string[];
}

const MAX_GIFT_RECIPIENTS = 20;

/**
 * Send a gift request (D27, founder 10 Nov 2026: ONE LINK PER PERSON). Each recipient gets their OWN link, emailed
 * only to them, showing only what their circle may see, and switched off on its own. Family members are resolved
 * server-side (ACTIVE members of THIS family only); someone new by email gets extended — or, if the parent invites
 * them, an invite bound to their own address at the circle their relationship gives them. Owner-only.
 */
export async function sendGiftLinks(db: DbHandle, owner: ViewerContext, input: SendGiftLinksInput): Promise<GiftSendResult> {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== input.familyId) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can send a gift request' });
  }
  const recipients: { r: GiftRecipient; label: string }[] = [];
  const seen = new Set<string>();
  for (const t of input.to.slice(0, MAX_GIFT_RECIPIENTS)) {
    if ('memberAccountId' in t) {
      const id = String(t.memberAccountId);
      if (seen.has(`m:${id}`)) continue;
      seen.add(`m:${id}`);
      recipients.push({ r: { kind: 'member', accountId: id }, label: id });
    } else {
      const email = String(t.email ?? '').trim().toLowerCase();
      if (!isEmail(email) || seen.has(`e:${email}`)) continue;
      seen.add(`e:${email}`);
      const rel = t.relationship && (RELATIONSHIPS as readonly string[]).includes(t.relationship) && t.relationship !== 'CHILD' ? t.relationship : null;
      recipients.push({
        r: { kind: 'email', email, invite: input.invite && rel ? { relationship: rel, accessLevel: input.invite.accessLevel, shareOccasions: input.invite.shareOccasions } : null },
        label: email,
      });
    }
  }
  const batchId = randomUUID();
  const [fam] = await db.select({ name: families.displayName }).from(families).where(eq(families.id, input.familyId));
  const from = familyNameForRelatives(fam?.name) ?? 'your family';
  const note = screenFromName(input.note ?? null); // ≤40 chars, abuse-screened — reused for the short note
  let sent = 0;
  const skipped: string[] = [];
  for (const { r, label } of recipients) {
    let token: string;
    let to: string;
    try {
      const made = await createGiftLink(db, owner, { familyId: input.familyId, assetIds: input.assetIds, designIds: input.designIds, productKey: input.productKey, title: input.title, recipient: r, batchId });
      token = made.token;
      const [row] = await db.select({ email: giftLinks.recipientEmail }).from(giftLinks).where(eq(giftLinks.id, made.id));
      to = row!.email!;
    } catch (e) {
      if (e instanceof NothingToShowError) {
        skipped.push(label);
        continue;
      }
      if (e instanceof AuthzError) {
        // not a member any more, a bad address, nothing sendable: nothing sent (the reason only — never the address)
        console.warn('[gift] a link wasn’t made:', e.decision.reason);
        continue;
      }
      throw e;
    }
    await sendMail({
      kind: 'gift-list',
      to,
      subject: `a gift request from ${from} ✦`,
      text:
        `${from} has put together a little gift request — keepsakes made from the children's own drawings.` +
        (note ? `\n\n"${note}"` : '') +
        `\n\nHave a look (this link is just for you — it's private, and ticks itself off so nobody doubles up):\n${appUrl(`/g/${token}`)}`,
    });
    sent++;
  }
  return { batchId, sent, skipped };
}

/** Switch off every link from one send ("switch them all off"). Owner-only; each is revoked and audited on its own. */
export async function revokeGiftBatch(db: DbHandle, owner: ViewerContext, familyId: string, batchId: string): Promise<{ ok: boolean; revoked: number }> {
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== familyId) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can revoke a gift link' });
  }
  const links = await db
    .select({ id: giftLinks.id })
    .from(giftLinks)
    .where(and(eq(giftLinks.familyId, familyId), eq(giftLinks.batchId, String(batchId)), eq(giftLinks.status, 'ACTIVE')));
  for (const l of links) await revokeGiftLink(db, owner, l.id);
  return { ok: true, revoked: links.length };
}
