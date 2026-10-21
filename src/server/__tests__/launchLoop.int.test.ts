import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { children, consentRecords, giftLinks, invites, memberships, orderItemArtwork, orderItems, orders, reminderSends } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { resolveViewerContext } from '@/server/assets';
import { seedCatalogue } from '@/server/catalogue';
import { addChild } from '@/server/children';
import { createGiftLink, getGiftLink, listGiftListsForOwner, placeGiftLinkOrder, revokeGiftLink, sendGiftRequest } from '@/server/giftLinks';
import { deleteSavedDesign, listSavedDesigns, saveDesign } from '@/server/savedDesigns';
import { ingestOriginalAsset } from '@/server/ingest';
import { markOrderPaid, placeOrder } from '@/server/orders';
import { resolveHomeFamily } from '@/server/onboarding';
import { resolvePromo } from '@/server/promos';
import { getCreditBalance, getOrCreateReferralCode } from '@/server/referrals';
import { acceptInvite, createInvite, setMemberSeesOccasions } from '@/server/invites';
import { runReminders, setReminderConsent } from '@/server/reminders';
import { deleteObject } from '@/storage';
import type { JoinProvenance } from '@/pricing';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/** A drawing big enough to print well on a framed print (and a tiny one that can't). */
const drawing = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 255, g: 253, b: 247 } } })
    .composite([{ input: { create: { width: Math.ceil(w / 3), height: Math.ceil(h / 3), channels: 3, background: { r: 232, g: 120, b: 110 } } }, left: Math.floor(w / 3), top: Math.floor(h / 3) }])
    .png()
    .toBuffer();

/**
 * The launch loop end to end, against the real DB + object store (proposal/05 G1–G10):
 * a grandparent buying from a gift link (guest or joined), the pre-payment print-quality
 * gate, children as keepsake subjects, the joined relative's home, consented reminders.
 */
describe.skipIf(!DB || !S3)('launch loop — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const keys: string[] = [];
  const orderRefs: string[] = [];
  const extraAccounts: string[] = [];

  const prevStripeKey = process.env.STRIPE_SECRET_KEY;
  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // dev "mark paid" path — never create real Checkout sessions in tests
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });

  afterAll(async () => {
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (orderRefs.length) await db.delete(orders).where(inArray(orders.ref, orderRefs));
    await db.delete(giftLinks).where(inArray(giftLinks.familyId, [ids.hartleyId, ids.bloomId]));
    await db.delete(reminderSends).where(inArray(reminderSends.accountId, [ids.samId, ids.blakeId, ids.rosieId]));
    await db.delete(consentRecords).where(inArray(consentRecords.accountId, [ids.samId, ids.blakeId]));
    if (ids) await cleanupDemoFamilies(db, ids);
    if (extraAccounts.length) await db.delete(schema.accounts).where(inArray(schema.accounts.id, extraAccounts));
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  async function keptDrawing(familyId = ids.hartleyId, ownerId = ids.samId, size: [number, number] = [1500, 1900]) {
    const owner = await resolveViewerContext(db, ownerId, familyId);
    const r = await ingestOriginalAsset(db, owner, { familyId, kind: 'DRAWING', buffer: await drawing(...size), keptInHome: true });
    keys.push(r.key);
    return r.assetId;
  }

  async function linkFor(assetIds: string[], productKey?: string) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    return createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds, productKey });
  }

  // ── G1: a gift-link purchase carries the child's artwork ──────────────────
  it('a GUEST buying from a gift link gets an order that carries the keepsake (printable), as a gift, in the family', async () => {
    const assetId = await keptDrawing();
    const { token } = await linkFor([assetId]);

    const res = await placeGiftLinkOrder(db, { token, account: null, joinProvenance: null });
    expect(res.ok).toBe(true);
    orderRefs.push(res.ref!);

    const [order] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    expect(order).toMatchObject({ accountId: null, isGift: true, familyId: ids.hartleyId, status: 'PAID' });
    const art = await db
      .select({ assetId: orderItemArtwork.assetId, controller: orderItemArtwork.controllerAccountId, status: orderItemArtwork.status })
      .from(orderItemArtwork)
      .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
      .where(eq(orderItems.orderId, order!.id));
    expect(art).toEqual([{ assetId, controller: ids.samId, status: 'PENDING' }]); // → the fulfilment worker renders it
  });

  it('the parent chooses what the keepsake is sold as; an un-giftable product is refused', async () => {
    const assetId = await keptDrawing();
    const { token } = await linkFor([assetId], 'mug');
    const res = await placeGiftLinkOrder(db, { token, account: null, joinProvenance: null });
    expect(res.ok).toBe(true);
    orderRefs.push(res.ref!);
    const [line] = await db.select({ productKey: orderItems.productKey }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(eq(orders.ref, res.ref!));
    expect(line!.productKey).toBe('mug');

    await expect(linkFor([assetId], 'card')).rejects.toBeInstanceOf(AuthzError); // needs buyer input
    await expect(linkFor([assetId], 'not-a-product')).rejects.toBeInstanceOf(AuthzError);
  });

  it('a REVOKED or EXPIRED link can no longer be bought from', async () => {
    const assetId = await keptDrawing();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await linkFor([assetId]);
    await revokeGiftLink(db, sam, a.id);
    expect(await placeGiftLinkOrder(db, { token: a.token, account: null, joinProvenance: null })).toMatchObject({ ok: false, unavailable: true });

    const b = await linkFor([assetId]);
    await db.update(giftLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(giftLinks.id, b.id));
    expect(await placeGiftLinkOrder(db, { token: b.token, account: null, joinProvenance: null })).toMatchObject({ ok: false, unavailable: true });
  });

  it("a gift-link grant never widens to a keepsake outside its snapshot (or another family's)", async () => {
    const inLink = await keptDrawing();
    const notInLink = await keptDrawing();
    const bloomArt = await keptDrawing(ids.bloomId, ids.blakeId);
    const [link] = await db.select().from(giftLinks).where(eq(giftLinks.id, (await linkFor([inLink])).id));
    const grant = { familyId: link!.familyId, status: 'ACTIVE' as const, expiresAt: link!.expiresAt, assetIds: [inLink] };

    for (const assetId of [notInLink, bloomArt]) {
      await expect(
        placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId, transform: { scale: 0 } } }], account: null, joinProvenance: null, giftLink: grant }),
      ).rejects.toBeInstanceOf(AuthzError);
    }
  });

  it('a relative who JOINED this family gets the 5% on the gift link; another family’s join does not count', async () => {
    const assetId = await keptDrawing();
    const { token } = await linkFor([assetId]);
    const [row] = await db
      .select({ m: memberships, inv: invites })
      .from(memberships)
      .innerJoin(invites, eq(memberships.inviteId, invites.id))
      .where(and(eq(memberships.accountId, ids.rosieId), eq(memberships.familyId, ids.hartleyId)));
    const provenance: JoinProvenance = {
      invite: { id: row!.inv.id, familyId: row!.inv.familyId, verified: true, revoked: false, expiresAt: Date.now() + 86_400_000 },
      membership: { familyId: row!.m.familyId, status: 'ACTIVE', inviteId: row!.m.inviteId, isOwner: false, savingConsumed: false },
      now: Date.now(),
    };

    const joined = await placeGiftLinkOrder(db, { token, account: { id: ids.rosieId }, joinProvenance: provenance });
    expect(joined.ok).toBe(true);
    orderRefs.push(joined.ref!);
    const [o1] = await db.select().from(orders).where(eq(orders.ref, joined.ref!));
    expect(o1!.joinSavingPence).toBe(Math.round(o1!.subtotalPence * 0.05));

    const foreign: JoinProvenance = { ...provenance, invite: { ...provenance.invite!, familyId: ids.bloomId }, membership: { ...provenance.membership!, familyId: ids.bloomId } };
    const second = await linkFor([await keptDrawing()]); // the first link's item is now bought (ticked off)
    const other = await placeGiftLinkOrder(db, { token: second.token, account: { id: ids.rosieId }, joinProvenance: foreign });
    orderRefs.push(other.ref!);
    const [o2] = await db.select().from(orders).where(eq(orders.ref, other.ref!));
    expect(o2!.joinSavingPence).toBe(0);
  });

  // ── G16: the gift list keeps tabs ─────────────────────────────────────────
  it('a bought item is ticked off: shown as bought (not who) to link-holders, not sold again; the parent sees who', async () => {
    const a = await keptDrawing();
    const b = await keptDrawing();
    const { token } = await linkFor([a, b]);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);

    // Granny buys the whole list as a guest, signing it.
    const first = await placeGiftLinkOrder(db, { token, account: null, joinProvenance: null, fromName: '  Granny  ' });
    expect(first.ok).toBe(true);
    orderRefs.push(first.ref!);
    const [o] = await db.select().from(orders).where(eq(orders.ref, first.ref!));
    expect(o).toMatchObject({ giftFromName: 'Granny', status: 'PAID' }); // dev path marks paid (and notifies)

    const view = await getGiftLink(db, token);
    expect(view.state).toBe('active');
    if (view.state !== 'active') return;
    expect(view.items.every((i) => i.purchased)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('Granny'); // link-holders never learn who

    // Nothing left to sell.
    expect(await placeGiftLinkOrder(db, { token, account: null, joinProvenance: null })).toMatchObject({ ok: false, allBought: true });

    // The parent sees the sticker.
    const lists = await listGiftListsForOwner(db, sam, ids.hartleyId);
    const mine = lists.find((l) => l.token === token)!;
    expect(mine.items.map((i) => i.boughtBy)).toEqual(['Granny', 'Granny']);
    // …and a non-owner sees no lists at all.
    expect(await listGiftListsForOwner(db, await resolveViewerContext(db, ids.rosieId, ids.hartleyId), ids.hartleyId)).toEqual([]);
  });

  it('a partly-bought list only sells what is left; an abusive or over-long "from" is dropped', async () => {
    const a = await keptDrawing();
    const b = await keptDrawing();
    const { id, token } = await linkFor([a, b]);
    // Simulate an earlier purchase of item a only (a PAID order through the link).
    const one = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: a, transform: { scale: 0 } } }],
      account: null,
      joinProvenance: null,
      giftLink: { familyId: ids.hartleyId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86_400_000), assetIds: [a, b] },
      giftMeta: { linkId: id, fromName: 'Uncle Bo' },
    });
    orderRefs.push(one.ref!);

    const rest = await placeGiftLinkOrder(db, { token, account: null, joinProvenance: null, fromName: 'x'.repeat(41) });
    orderRefs.push(rest.ref!);
    const lines = await db
      .select({ assetId: orderItemArtwork.assetId })
      .from(orderItemArtwork)
      .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orders.ref, rest.ref!));
    expect(lines).toEqual([{ assetId: b }]);
    const [o] = await db.select().from(orders).where(eq(orders.ref, rest.ref!));
    expect(o!.giftFromName).toBeNull();
  });

  // ── D16: "+ Keepsake" saved designs → a gift request sold exactly as designed ──
  it('a saved design goes into a gift request and is bought exactly as designed (variant + placement)', async () => {
    const assetId = await keptDrawing();
    const saved = await saveDesign(db, { id: ids.samId, name: null }, [], {
      assetId,
      variantSku: 'mug',
      transform: { scale: 1.4, offsetX: 0.2, offsetY: 0, rotationDeg: 0 },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    // card needs the buyer's own message → not savable; unknown sku refused
    expect(await saveDesign(db, { id: ids.samId, name: null }, [], { assetId, variantSku: 'card', transform: {} })).toEqual({ ok: false, reason: 'not-savable' });

    const list = await listSavedDesigns(db, ids.samId, ids.hartleyId);
    expect(list.find((d) => d.id === saved.id)).toMatchObject({ assetId, variantSku: 'mug', productKey: 'mug' });
    // someone else's saved designs aren't theirs to see
    expect((await listSavedDesigns(db, ids.joId, ids.hartleyId)).some((d) => d.id === saved.id)).toBe(false);

    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const link = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [], designIds: [saved.id] });
    const res = await placeGiftLinkOrder(db, { token: link.token, account: null, joinProvenance: null, fromName: 'Granny' });
    expect(res.ok).toBe(true);
    orderRefs.push(res.ref!);
    const [line] = await db
      .select({ productKey: orderItems.productKey, transform: orderItemArtwork.transform })
      .from(orderItems)
      .innerJoin(orderItemArtwork, eq(orderItemArtwork.orderItemId, orderItems.id))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orders.ref, res.ref!));
    expect(line!.productKey).toBe('mug');
    expect(line!.transform).toMatchObject({ scale: 1.4, offsetX: 0.2 });

    // sending: owner only; members resolved server-side; junk emails dropped
    const sent = await sendGiftRequest(db, sam, { familyId: ids.hartleyId, linkId: link.id, memberAccountIds: [ids.rosieId, ids.blakeId], emails: ['aunt@example.test', 'not-an-email'] });
    expect(sent.sent).toBe(2); // Rosie (member) + the aunt; Blake is another family's — ignored
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    await expect(sendGiftRequest(db, rosie, { familyId: ids.hartleyId, linkId: link.id, memberAccountIds: [], emails: ['x@example.test'] })).rejects.toBeInstanceOf(AuthzError);

    expect(await deleteSavedDesign(db, ids.joId, saved.id)).toBe(false); // not theirs
    expect(await deleteSavedDesign(db, ids.samId, saved.id)).toBe(true);
  });

  // ── D17: give £5, get £5 — referral codes + the credit ledger ─────────────
  it('referral: friend gets £5 off a first order; referrer earns £5 credit once paid; no self-use, no repeat; credit spends at checkout', async () => {
    const [sam] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, ids.samId));
    const code = await getOrCreateReferralCode(db, { id: sam!.id, email: sam!.email, name: null });
    expect(await getOrCreateReferralCode(db, { id: sam!.id, email: sam!.email, name: null })).toBe(code); // stable
    try {
      // the owner can't use their own code
      expect(await resolvePromo(db, code, new Date(), { accountId: ids.samId, email: sam!.email })).toEqual({ ok: false, reason: 'own-code' });

      // a brand-new guest buyer: £5 off a £65 print
      const r = await resolvePromo(db, code, new Date(), null);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const guestEmail = `friend-${ids.nonce}@example.test`;
      const first = await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: r.rule, buyerEmail: guestEmail });
      orderRefs.push(first.ref!);
      const [o1] = await db.select().from(orders).where(eq(orders.ref, first.ref!));
      expect(o1!.promoSavingPence).toBe(500);
      expect(await getCreditBalance(db, ids.samId)).toBe(500); // dev path pays immediately → reward settled

      // the same buyer again: no second discount, no second reward
      const again = await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: r.rule, buyerEmail: guestEmail });
      orderRefs.push(again.ref!);
      expect(await getCreditBalance(db, ids.samId)).toBe(500);
      expect(await resolvePromo(db, code, new Date(), { accountId: null, email: guestEmail })).toEqual({ ok: false, reason: 'first-order-only' });

      // a self-referral by email (owner buying as a guest) earns nothing
      const self = await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: r.rule, buyerEmail: sam!.email });
      orderRefs.push(self.ref!);
      expect(await getCreditBalance(db, ids.samId)).toBe(500);

      // Sam spends the credit: £5 off, debited once
      const spend = await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: { id: ids.samId }, joinProvenance: null, creditAvailablePence: 500, buyerEmail: sam!.email });
      orderRefs.push(spend.ref!);
      const [o4] = await db.select().from(orders).where(eq(orders.ref, spend.ref!));
      expect(o4!.creditAppliedPence).toBe(500);
      expect(o4!.totalPence).toBe(o4!.subtotalPence - 500 + o4!.deliveryPence);
      expect(await getCreditBalance(db, ids.samId)).toBe(0);
      await markOrderPaid(db, o4!.id); // retry → idempotent
      expect(await getCreditBalance(db, ids.samId)).toBe(0);
    } finally {
      const refs = await db.select({ id: orders.id }).from(orders).where(inArray(orders.ref, orderRefs));
      await db.delete(schema.accountCredits).where(eq(schema.accountCredits.accountId, ids.samId));
      await db.update(orders).set({ promoCodeId: null }).where(inArray(orders.id, refs.map((x) => x.id)));
      await db.delete(schema.promoCodes).where(eq(schema.promoCodes.code, code));
    }
  });

  // ── D15: discount + partner codes, priced server-side, margin-guarded ─────
  it('codes: resolved server-side, priced from DB costs, persisted with partner commission; limits + expiry enforced', async () => {
    const code = `T${ids.nonce.toUpperCase()}`.slice(0, 12);
    const [promoRow] = await db
      .insert(schema.promoCodes)
      .values({ code, kind: 'PERCENT', value: 1000, commissionBps: 500, partnerName: 'Test creator', partnerType: 'INFLUENCER', maxRedemptions: 1 })
      .returning();
    try {
      // lower-case + spaces as a customer might type it
      const r = await resolvePromo(db, ` ${code.toLowerCase()} `);
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      // DB unit costs drive the guard: give the framed print a known landed cost for this test.
      const res = await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: r.rule });
      expect(res.ok).toBe(true);
      orderRefs.push(res.ref!);
      const [o] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
      expect(o!.promoCodeId).toBe(promoRow!.id);
      expect(o!.promoSavingPence).toBe(Math.round(o!.subtotalPence * 0.1));
      expect(o!.totalPence).toBe(o!.subtotalPence - o!.promoSavingPence + o!.deliveryPence);
      expect(o!.partnerCommissionPence).toBeGreaterThan(0);

      // max 1 redemption → the paid order used it up
      expect(await resolvePromo(db, code)).toEqual({ ok: false, reason: 'used-up' });

      // expiry + unknown
      await db.update(schema.promoCodes).set({ maxRedemptions: null, endsAt: new Date(Date.now() - 1000) }).where(eq(schema.promoCodes.id, promoRow!.id));
      expect(await resolvePromo(db, code)).toEqual({ ok: false, reason: 'expired' });
      expect(await resolvePromo(db, 'NOPE-NOT-A-CODE')).toEqual({ ok: false, reason: 'unknown' });
    } finally {
      await db.update(orders).set({ promoCodeId: null }).where(eq(orders.promoCodeId, promoRow!.id));
      await db.delete(schema.promoCodes).where(eq(schema.promoCodes.id, promoRow!.id));
    }
  });

  // ── G5: print quality is decided BEFORE money moves ───────────────────────
  it('an under-resolution placement is refused before any order row is written', async () => {
    const tiny = await keptDrawing(ids.hartleyId, ids.samId, [200, 150]);
    const before = await db.select({ id: orders.id }).from(orders);
    const res = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: tiny, transform: { scale: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    expect(res).toMatchObject({ ok: false, reason: 'too-small', productKey: 'framedPrint' });
    expect((await db.select({ id: orders.id }).from(orders)).length).toBe(before.length);
  });

  // ── G6: children are keepsake subjects — first name only ──────────────────
  it('the owner adds a child (first name + birthday); a surname is refused, a non-owner is refused', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    expect(await addChild(db, sam, { familyId: ids.hartleyId, firstName: 'Ada Lovelace' })).toEqual({ ok: false, reason: 'surname' });
    // Ada's birthday is ~half a year away, ALWAYS outside the 10–21-day reminder window: a fixed
    // date (it was 2 Nov) became a time bomb every late October — her reminder used Sam's weekly
    // cap and starved the reminder tests below.
    const far = new Date(Date.now() + 180 * 86_400_000);
    const adaBday = `2021-${String(far.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(far.getUTCDate(), 28)).padStart(2, '0')}`;
    const ok = await addChild(db, sam, { familyId: ids.hartleyId, firstName: 'Ada', birthday: adaBday });
    expect(ok.ok).toBe(true);
    const [row] = await db.select().from(children).where(and(eq(children.familyId, ids.hartleyId), eq(children.firstName, 'Ada')));
    expect(String(row!.birthday).slice(0, 10)).toBe(adaBday);

    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    expect(await addChild(db, rosie, { familyId: ids.hartleyId, firstName: 'Bea' })).toEqual({ ok: false, reason: 'not-owner' });
  });

  // ── G3: a joined relative lands in the family they joined ─────────────────
  it('a relative with no family of their own sees the family they joined (no empty box created)', async () => {
    const famId = await resolveHomeFamily(db, ids.rosieId, null);
    expect(famId).toBe(ids.hartleyId);
    const owned = await db.select().from(memberships).where(and(eq(memberships.accountId, ids.rosieId), eq(memberships.isOwner, true)));
    expect(owned).toHaveLength(0);
  });

  // ── G15: the family calendar — the parent's per-invite choice, changeable ──
  it('family calendar: the invite choice lands on the membership; the parent can change it; only shared relatives get reminders', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [rosie] = await db.select().from(memberships).where(and(eq(memberships.accountId, ids.rosieId), eq(memberships.familyId, ids.hartleyId)));
    expect(rosie!.seesOccasions).toBe(false); // seeded before the choice existed → not shared (safe default)

    // An invite sent WITH the calendar → the joined member sees it; WITHOUT → doesn't.
    for (const share of [true, false]) {
      const email = `cal-${share}-${ids.nonce}@example.test`;
      const [acct] = await db.insert(schema.accounts).values({ email }).returning();
      extraAccounts.push(acct!.id);
      const { token } = await createInvite(db, sam, { familyId: ids.hartleyId, email, relationship: 'AUNT_UNCLE', accessLevel: 'VIEW_BUY', shareOccasions: share });
      expect((await acceptInvite(db, { id: acct!.id, email }, token)).ok).toBe(true);
      const [m] = await db.select().from(memberships).where(and(eq(memberships.accountId, acct!.id), eq(memberships.familyId, ids.hartleyId)));
      expect(m!.seesOccasions).toBe(share);
    }

    // The parent turns it on for Rosie; a non-owner can't.
    expect((await setMemberSeesOccasions(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, on: true })).ok).toBe(true);
    const joViewer = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await expect(setMemberSeesOccasions(db, joViewer, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, on: false })).rejects.toBeInstanceOf(AuthzError);

    // Reminders: Rosie (calendar + her own consent) gets one; turning the calendar off stops them.
    const soon = new Date(Date.now() + 14 * 86_400_000);
    await addChild(db, sam, { familyId: ids.hartleyId, firstName: 'Ivy', birthday: `2019-${String(soon.getUTCMonth() + 1).padStart(2, '0')}-${String(soon.getUTCDate()).padStart(2, '0')}` });
    const [ivy] = await db.select().from(children).where(and(eq(children.familyId, ids.hartleyId), eq(children.firstName, 'Ivy')));
    await setReminderConsent(db, ids.rosieId, true, 'test');
    await runReminders(db);
    const rosieSends = () => db.select().from(reminderSends).where(and(eq(reminderSends.accountId, ids.rosieId), eq(reminderSends.childId, ivy!.id)));
    expect(await rosieSends()).toHaveLength(1);

    await setMemberSeesOccasions(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, on: false });
    await db.delete(reminderSends).where(eq(reminderSends.accountId, ids.rosieId));
    await runReminders(db);
    expect(await rosieSends()).toHaveLength(0);
    await db.delete(consentRecords).where(eq(consentRecords.accountId, ids.rosieId));
    await db.delete(children).where(eq(children.id, ivy!.id)); // keep later occasion tests independent
  });

  // ── G10: reminders — consent-gated, once per occasion ─────────────────────
  it('reminders: nothing without consent; with consent exactly one per occasion, never twice', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const soon = new Date(Date.now() + 15 * 86_400_000);
    const bday = `2020-${String(soon.getUTCMonth() + 1).padStart(2, '0')}-${String(soon.getUTCDate()).padStart(2, '0')}`;
    await addChild(db, sam, { familyId: ids.hartleyId, firstName: 'Nell', birthday: bday });
    const [nell] = await db.select().from(children).where(and(eq(children.familyId, ids.hartleyId), eq(children.firstName, 'Nell')));
    const sentFor = async () => db.select().from(reminderSends).where(and(eq(reminderSends.accountId, ids.samId), eq(reminderSends.childId, nell!.id)));

    await runReminders(db);
    expect(await sentFor()).toHaveLength(0); // no consent → nothing

    await setReminderConsent(db, ids.samId, true, 'test');
    await runReminders(db);
    await runReminders(db); // an overlapping/second run must not double-send
    expect(await sentFor()).toHaveLength(1);

    await setReminderConsent(db, ids.samId, false, 'test'); // one-tap withdraw is honoured
    await db.delete(reminderSends).where(eq(reminderSends.accountId, ids.samId));
    await runReminders(db);
    expect(await sentFor()).toHaveLength(0);
  });
});
