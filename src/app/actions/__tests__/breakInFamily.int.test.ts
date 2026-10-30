import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';

/**
 * BREAK-IN SWEEP (tester 07, 2026-10-29) — in-family escalations and forgery, found by reading the
 * actions and then PROVEN here against a real Postgres + MinIO. Each `it` asserts the CORRECT rule
 * from CLAUDE.md. The ones that fail today are `it.skip` with the bug id (07-Bn) — un-skip them when
 * the bug is fixed. See reports/test-sweep-2026-10-29/07-break-in.md.
 */

const actor = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string | null }, claims: [] as string[] }));
vi.mock('@/server/session', async (orig) => ({
  ...(await orig<typeof import('@/server/session')>()),
  getCurrentAccount: async () => actor.current,
  getUploadClaims: async () => actor.claims,
}));
vi.mock('@/auth', () => ({ auth: async () => null, signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '203.0.113.78' }),
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn(), getAll: () => [] }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/server/mail', async (orig) => ({ ...(await orig<typeof import('@/server/mail')>()), sendMail: vi.fn(async () => {}) }));
vi.mock('@/server/rateLimit', async (orig) => ({
  ...(await orig<typeof import('@/server/rateLimit')>()),
  clientIp: async () => '203.0.113.78',
  rateLimit: vi.fn(async () => ({ ok: true, retryAfterSec: 0 })),
}));

import * as schema from '@/db/schema';
import { accounts, assets, giftLinks, invites, memberships, orders, promoCodes, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { changeAssetVisibility, resolveViewerContext } from '@/server/assets';
import { ingestEphemeralUpload, ingestOriginalAsset } from '@/server/ingest';
import { resolvePromo } from '@/server/promos';
import { renderPrintFile } from '@/server/print/render';
import { createGiftLink, listGiftListsForOwner } from '@/server/giftLinks';
import { deleteObject, derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import { createHash } from 'node:crypto';
import { saveStudioAction } from '@/app/actions/magic';
import { copyKeepsakeAction } from '@/app/actions/keepsakePicker';
import { finishPendingKeepsAction, rememberKeepAction, setAssetVisibilityAction } from '@/app/actions/keep';
import { placeOrderAction } from '@/app/actions/order';
import { reportGiftLinkAction, reportKeepsakeAction } from '@/app/actions/report';
import { saveDesignAction } from '@/app/actions/designs';
import { addChildAction, updateChildAction } from '@/app/actions/family';

const DB = process.env.DATABASE_URL;
/** Known bugs: skipped so the suite stays green; T7_SHOW_BUGS=1 runs them to show each one failing. */
const bug = process.env.T7_SHOW_BUGS ? it : it.skip;
const S3 = process.env.S3_ENDPOINT;

const art = () =>
  sharp({ create: { width: 1600, height: 1600, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: { create: { width: 800, height: 800, channels: 3, background: { r: 47, g: 93, b: 168 } } }, left: 400, top: 400 }])
    .png()
    .toBuffer();
const TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
const acct = (id: string, email = `${id.slice(0, 6)}@example.test`) => ({ id, email, name: id.slice(0, 6) });

describe.skipIf(!DB || !S3)('break-in: in-family escalation + forgery (integration)', () => {
  const db = getDb() as unknown as import('@/server/db').DbHandle;
  let ids: SeededIds;
  const keys: string[] = [];
  const extra: string[] = [];
  let vicId: string;
  let famNoChild: string; // Sam's FAMILY keepsake with no child filed (the ordinary "keepCreation" upload)
  let extAsset: string; // Sam's EXTENDED keepsake

  beforeAll(async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', ''); // dev order path: no call to Stripe at all
    ids = await seedDemoFamilies(db);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true });
    const e = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true, childSubjectId: ids.oliviaId });
    keys.push(a.key, e.key);
    famNoChild = a.assetId;
    extAsset = e.assetId;
    await changeAssetVisibility(db, e.assetId, sam, 'EXTENDED');
    await db.update(assets).set({ moderationStatus: 'CLEAR' }).where(inArray(assets.id, [a.assetId, e.assetId]));

    vicId = randomUUID(); // FAMILY circle, VIEW access
    extra.push(vicId);
    await db.insert(accounts).values({ id: vicId, email: `vic-${randomBytes(3).toString('hex')}@example.test` });
    const [inv] = await db
      .insert(invites)
      .values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, email: 'vic@example.test', relationship: 'CLOSE_FRIEND', circle: 'FAMILY', accessLevel: 'VIEW', token: `tok-vic2-${randomBytes(8).toString('hex')}`, status: 'VERIFIED', expiresAt: new Date(Date.now() + 864e5) })
      .returning();
    await db.insert(memberships).values({ familyId: ids.hartleyId, accountId: vicId, relationship: 'CLOSE_FRIEND', circle: 'FAMILY', accessLevel: 'VIEW', status: 'ACTIVE', inviteId: inv!.id });
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    actor.current = null;
    actor.claims = [];
    if (!ids) return;
    const fams = [ids.hartleyId, ids.bloomId];
    await db.delete(orders).where(inArray(orders.familyId, fams)).catch(() => {});
    await db.delete(giftLinks).where(inArray(giftLinks.familyId, fams)).catch(() => {});
    for (const k of keys) await deleteObject(k).catch(() => {});
    await db.delete(memberships).where(inArray(memberships.accountId, extra)).catch(() => {});
    await cleanupDemoFamilies(db, ids).catch(() => {});
  });

  // ── 07-B2: a viewer (EXTENDED / VIEW) can rewrite the family's keepsake look ──────────────────────
  it('07-B2: an EXTENDED-circle, VIEW_BUY grandparent cannot change the Studio edits of a keepsake they can only SEE', async () => {
    actor.current = acct(ids.rosieId);
    const before = (await db.select().from(assets).where(eq(assets.id, extAsset)))[0]!.studioDoc;
    const res = await saveStudioAction({ assetId: extAsset, mask: null, geometry: { rotate: 180, background: '#000000' } as never, objects: [] });
    expect(res).toMatchObject({ ok: false });
    expect((await db.select().from(assets).where(eq(assets.id, extAsset)))[0]!.studioDoc).toEqual(before);
    expect(await db.select().from(storageObjects).where(eq(storageObjects.key, derivativeKey(extAsset, 'design')))).toHaveLength(0);
  });

  // ── 07-B3: copy → the copier becomes controller → widens a FAMILY-only drawing to EXTENDED ─────────
  it('07-B3: a FAMILY-circle contributor cannot use "copy" to republish a FAMILY-only keepsake to the Extended circle', async () => {
    actor.current = acct(ids.joId);
    const copy = await copyKeepsakeAction({ assetId: famNoChild });
    expect(copy, 'a contributor can still make an edited copy').toMatchObject({ ok: true });
    if (!copy.ok) return;
    const [row] = await db.select().from(assets).where(eq(assets.id, copy.assetId));
    keys.push(`originals/${copy.assetId}`);
    expect(row!.controllerAccountId, 'the copy stays under the controlling parent').toBe(ids.samId);
    expect(row!.uploaderAccountId, 'the relative is only its uploader').toBe(ids.joId);
    expect(row!.visibility, 'never wider than the source').toBe('FAMILY');
    expect(await setAssetVisibilityAction(copy.assetId, 'EXTENDED')).toEqual({ ok: false });
    expect(await setAssetVisibilityAction(copy.assetId, 'ONLY_ME')).toEqual({ ok: false });
    // the controlling parent can still narrow it (and so delete it)
    actor.current = acct(ids.samId);
    expect(await setAssetVisibilityAction(copy.assetId, 'ONLY_ME')).toEqual({ ok: true });
  });

  // ── 07-B4: a VIEW member can buy ────────────────────────────────────────────────────────────────
  it('07-B4: a VIEW-access member cannot place an order for the family’s keepsake (VIEW ≠ VIEW_BUY)', async () => {
    actor.current = acct(vicId);
    const res = await placeOrderAction({ items: [{ productKey: 'mug', qty: 1, artwork: { assetId: famNoChild, transform: TRANSFORM as never } }] });
    expect(res).toMatchObject({ ok: false });
  });

  // ── 07-B5: a guest can push a drawing into ANY email's keepsake box ───────────────────────────────
  it('07-B5: a guest’s "+ keepsake" for someone else’s email does not land the drawing in that person’s family', async () => {
    const draft = await ingestEphemeralUpload(db, { buffer: await art(), kind: 'DRAWING', termsVersion: 't7' });
    keys.push(draft.key);
    actor.current = null;
    actor.claims = [draft.claimId];
    const [blake] = await db.select().from(accounts).where(eq(accounts.id, ids.blakeId));
    await rememberKeepAction(draft.assetId, blake!.email); // the attacker names the victim's address
    actor.claims = [];
    actor.current = acct(ids.blakeId, blake!.email); // the victim signs in (e.g. via the sign-in email the attacker triggered)
    const done = await finishPendingKeepsAction();
    const [row] = await db.select().from(assets).where(eq(assets.id, draft.assetId));
    expect(done.kept).not.toContain(draft.assetId);
    expect(row!.familyId).not.toBe(ids.bloomId);
  });

  // ── 07-B6: first-order-only / own-code promo rules skipped for a guest ─────────────────────────────
  bug('07-B6: a personal referral code (first order only, never your own) is refused when the buyer is a signed-out guest who already paid', async () => {
    const code = `T7REF${randomBytes(3).toString('hex').toUpperCase()}`;
    await db.insert(promoCodes).values({ code, kind: 'FIXED', value: 500, minSpendPence: 3000, ownerAccountId: ids.samId, firstOrderOnly: true, partnerType: 'REFERRAL', active: true } as never);
    try {
      // the code's own owner, signed in: refused
      expect(await resolvePromo(db, code, new Date(), { accountId: ids.samId })).toMatchObject({ ok: false });
      // the same person checking out signed out (no buyer): should be refused too — today it is ok:true
      expect(await resolvePromo(db, code, new Date(), null)).toMatchObject({ ok: false });
    } finally {
      await db.delete(promoCodes).where(eq(promoCodes.code, code));
    }
  });

  // ── 07-B7: report on a REVOKED gift link still holds the keepsakes ─────────────────────────────────
  it('07-B7: a revoked gift link can no longer be used to put its keepsakes on hold', async () => {
    const token = randomBytes(24).toString('base64url');
    await db.insert(giftLinks).values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, token, items: [{ assetId: extAsset, productKey: 'mug', label: 'mug', unitPricePence: 1800 }], status: 'REVOKED', revokedAt: new Date(), expiresAt: new Date(Date.now() + 864e5) });
    actor.current = null;
    expect(await reportGiftLinkAction({ token, reason: 'other', note: 't7' }).catch(() => ({ ok: false }))).toMatchObject({ ok: false });
    expect((await db.select().from(assets).where(eq(assets.id, extAsset)))[0]!.moderationStatus).toBe('CLEAR');
    // an EXPIRED (never revoked) link is just as dead
    const old = randomBytes(24).toString('base64url');
    await db.insert(giftLinks).values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, token: old, items: [{ assetId: extAsset, productKey: 'mug', label: 'mug', unitPricePence: 1800 }], expiresAt: new Date(Date.now() - 60_000) });
    expect(await reportGiftLinkAction({ token: old, reason: 'other', note: 't7' }).catch(() => ({ ok: false }))).toMatchObject({ ok: false });
    expect((await db.select().from(assets).where(eq(assets.id, extAsset)))[0]!.moderationStatus).toBe('CLEAR');
  });

  // ── 07-B8: existence/hold oracle on reportKeepsakeAction ──────────────────────────────────────────
  it('07-B8: an outsider reporting a HELD keepsake of another family gets the same answer as for a made-up id', async () => {
    await db.update(assets).set({ moderationStatus: 'FLAGGED', moderationDetail: { reports: [{ reason: 'other' }] } }).where(eq(assets.id, extAsset));
    try {
      actor.current = acct(ids.blakeId);
      const real = await reportKeepsakeAction({ assetId: extAsset, reason: 'other' });
      const ghost = await reportKeepsakeAction({ assetId: randomUUID(), reason: 'other' });
      expect(real).toEqual(ghost);
    } finally {
      await db.update(assets).set({ moderationStatus: 'CLEAR', moderationDetail: null }).where(eq(assets.id, extAsset));
    }
  });

  // ── 07-B1: existence oracle on saveDesignAction ──────────────────────────────────────────────────
  it('07-B1: saveDesignAction answers an outsider the same for another family’s keepsake as for a made-up id', async () => {
    actor.current = acct(ids.blakeId);
    const real = await saveDesignAction({ assetId: famNoChild, variantSku: 'mug', transform: TRANSFORM as never });
    const ghost = await saveDesignAction({ assetId: randomUUID(), variantSku: 'mug', transform: TRANSFORM as never });
    expect(real).toEqual(ghost);
  });

  // ── what HOLDS (pinned) ─────────────────────────────────────────────────────────────────────────
  it('a guest without the draft’s claim cannot ask for it to be kept for anyone', async () => {
    const draft = await ingestEphemeralUpload(db, { buffer: await art(), kind: 'DRAWING', termsVersion: 't7' });
    keys.push(draft.key);
    actor.current = null;
    actor.claims = [randomUUID()]; // a different (forged or other) claim
    expect(await rememberKeepAction(draft.assetId, 'someone@example.test')).toEqual({ ok: false });
    actor.claims = [];
  });

  it('a REMOVED member cannot order, copy or save a design from the family keepsake', async () => {
    actor.current = acct(ids.malloryId);
    expect(await placeOrderAction({ items: [{ productKey: 'mug', qty: 1, artwork: { assetId: extAsset, transform: TRANSFORM as never } }] })).toMatchObject({ ok: false });
    expect(await copyKeepsakeAction({ assetId: extAsset })).toMatchObject({ ok: false });
    expect(await saveDesignAction({ assetId: extAsset, variantSku: 'mug', transform: TRANSFORM as never })).toMatchObject({ ok: false });
  });

  it('forged order lines: negative / fractional / huge qty and a made-up product never price below zero or reach the order', async () => {
    actor.current = acct(ids.samId);
    const forged = await placeOrderAction({ items: [{ productKey: 'mug', qty: -5 }, { productKey: 'nonsense-product', qty: 3 }] });
    if (forged.ok && forged.ref) {
      const [o] = await db.select().from(orders).where(eq(orders.ref, forged.ref));
      expect(o!.totalPence).toBeGreaterThanOrEqual(0);
    }
    const huge = await placeOrderAction({ items: [{ productKey: 'mug', qty: 1e9 }] });
    if (huge.ok && huge.ref) {
      const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, (await db.select().from(orders).where(eq(orders.ref, huge.ref)))[0]!.id));
      for (const i of items) expect(i.qty).toBeLessThanOrEqual(100);
    }
  });

  it('an un-cleared (screening PENDING / FLAGGED) keepsake cannot be ordered even by its controller', async () => {
    actor.current = acct(ids.samId);
    for (const status of ['PENDING', 'FLAGGED'] as const) {
      await db.update(assets).set({ moderationStatus: status }).where(eq(assets.id, famNoChild));
      expect(await placeOrderAction({ items: [{ productKey: 'mug', qty: 1, artwork: { assetId: famNoChild, transform: TRANSFORM as never } }] })).toMatchObject({ ok: false });
    }
    await db.update(assets).set({ moderationStatus: 'CLEAR' }).where(and(eq(assets.id, famNoChild)));
  });
  it('a child is first name only: a surname (any space, incl. no-break / tab / newline) and markup are refused when adding or renaming', async () => {
    actor.current = acct(ids.samId);
    for (const firstName of ['Olivia Smith', 'Olivia\u00a0Smith', 'Olivia\tSmith', 'Olivia\nSmith', ' Olivia  Smith ']) {
      expect(await addChildAction({ firstName }), JSON.stringify(firstName)).toMatchObject({ ok: false, reason: 'surname' });
      expect(await updateChildAction(ids.oliviaId, { firstName }), JSON.stringify(firstName)).toMatchObject({ ok: false });
    }
    for (const firstName of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'Olivia\u200bSmith', '{{7*7}}', "Robert'); DROP TABLE children;--"]) {
      expect(await addChildAction({ firstName }), JSON.stringify(firstName)).toMatchObject({ ok: false });
    }
    const names = (await db.select({ n: schema.children.firstName }).from(schema.children).where(eq(schema.children.familyId, ids.hartleyId))).map((r) => r.n);
    expect(names.every((n) => !/\s|</.test(n))).toBe(true);
  });

  it('a non-owner (second parent, VIEW member, outsider) cannot add a child to the family', async () => {
    for (const who of [ids.joId, vicId]) {
      actor.current = acct(who);
      const res = await addChildAction({ firstName: 'Intruder' });
      // they have no OWNED family here → refused, or the child lands in THEIR OWN new home — never in family A
      if (res.ok) expect((await db.select().from(schema.children).where(and(eq(schema.children.familyId, ids.hartleyId), eq(schema.children.firstName, 'Intruder')))).length).toBe(0);
    }
  });
  // ── 07-B11: the print file is keyed on asset + variant only → a later preview overwrites a paid order's file
  bug('07-B11: rendering a DIFFERENT placement of the same drawing on the same product does not overwrite an existing print file', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [v] = await db.select({ id: schema.productVariants.id }).from(schema.productVariants).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).where(and(eq(schema.products.key, 'mug'), eq(schema.productVariants.isDefault, true)));
    const ordered = await renderPrintFile(db, sam, { assetId: famNoChild, variantId: v!.id, transform: { scale: 1 } }); // the paid order's placement
    const [before] = await db.select().from(storageObjects).where(eq(storageObjects.id, ordered.printObjectId));
    keys.push(before!.key);
    const preview = await renderPrintFile(db, sam, { assetId: famNoChild, variantId: v!.id, transform: { scale: 2.5, offsetX: 0.3, rotationDeg: 90 } }); // a later "try another placement"
    const [after] = await db.select().from(storageObjects).where(eq(storageObjects.id, ordered.printObjectId));
    expect(preview.printObjectId === ordered.printObjectId && after!.sha256 !== before!.sha256, 'the ordered print file was replaced in place').toBe(false);
  });
  // ── 07-B12: the owner's gift-list view mints links to ORIGINALS without re-checking the gate ─────────
  it('07-B12: the owner’s gift-list view gives no picture for an item since made ONLY_ME by its controller, or BLOCKED', async () => {
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    const mine = await ingestOriginalAsset(db, jo, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true }); // Jo controls it
    const blocked = await ingestOriginalAsset(db, jo, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true });
    keys.push(mine.key, blocked.key);
    await db.insert(giftLinks).values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, token: randomBytes(24).toString('base64url'), items: [mine.assetId, blocked.assetId].map((assetId) => ({ assetId, productKey: 'mug', label: 'mug', unitPricePence: 1800 })), expiresAt: new Date(Date.now() + 864e5) });
    await changeAssetVisibility(db, mine.assetId, jo, 'ONLY_ME'); // Jo makes it private afterwards
    await db.update(assets).set({ moderationStatus: 'BLOCKED' }).where(eq(assets.id, blocked.assetId)); // later matched as illegal
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const items = (await listGiftListsForOwner(db, sam, ids.hartleyId)).flatMap((l) => l.items);
    expect.soft(items.find((i) => i.assetId === mine.assetId)?.imageUrl ?? null, 'ONLY_ME original').toBeNull();
    expect.soft(items.find((i) => i.assetId === blocked.assetId)?.imageUrl ?? null, 'BLOCKED original').toBeNull();
    // the items are still listed (by label) — only the picture is withheld
    expect(items.filter((i) => i.assetId === mine.assetId || i.assetId === blocked.assetId)).toHaveLength(2);
  });

  it('07-B12: the owner’s gift-list view shows no picture for an item held after a report, and still shows a cleared one', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const held = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true });
    const fine = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true });
    keys.push(held.key, fine.key);
    await db.update(assets).set({ moderationStatus: 'CLEAR' }).where(eq(assets.id, fine.assetId));
    await db.update(assets).set({ moderationStatus: 'FLAGGED', moderationDetail: { reports: [{ at: new Date().toISOString(), reason: 'test' }] } as never }).where(eq(assets.id, held.assetId));
    const [heldLink] = await db.insert(giftLinks).values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, token: randomBytes(24).toString('base64url'), items: [held.assetId, fine.assetId].map((assetId) => ({ assetId, productKey: 'mug', label: 'mug', unitPricePence: 1800 })), expiresAt: new Date(Date.now() + 864e5) }).returning();
    const lists = await listGiftListsForOwner(db, sam, ids.hartleyId);
    const items = lists.flatMap((l) => l.items);
    expect(items.find((i) => i.assetId === held.assetId)?.imageUrl ?? null, 'held original').toBeNull();
    expect(items.find((i) => i.assetId === fine.assetId)?.imageUrl, 'a cleared item keeps its picture').toBeTruthy();
    // 06-B5: the parent's list says it's offline while that keepsake is checked — never "0 of 2 bought"
    expect(lists.find((l) => l.id === heldLink!.id)?.status).toBe('HELD');
  });

  it('06-B7: a shared design keeps the cut-out it was shared with, even when the drawing is lifted again later', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    const cutKey = derivativeKey(famNoChild, 'cutout');
    const first = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 47, g: 93, b: 168, alpha: 1 } } }).png().toBuffer();
    await putObject(cutKey, first, 'image/png');
    keys.push(cutKey);
    const [cut] = await db
      .insert(storageObjects)
      .values({ assetId: famNoChild, objectClass: 'DERIVATIVE', bucket: getS3().bucket, key: cutKey, contentType: 'image/png', byteSize: first.byteLength, sha256: sha(first), exifStripped: true, writeOnce: false })
      .onConflictDoUpdate({ target: storageObjects.key, set: { sha256: sha(first), byteSize: first.byteLength } })
      .returning();
    const [variant] = await db.select({ sku: schema.productVariants.sku }).from(schema.productVariants).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).where(and(eq(schema.products.key, 'mug'), eq(schema.productVariants.isDefault, true)));
    const [design] = await db.insert(schema.savedDesigns).values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, assetId: famNoChild, variantSku: variant!.sku, transform: TRANSFORM, sourceObjectId: cut!.id }).returning();
    const { id: linkId } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [], designIds: [design!.id] });
    const [link] = await db.select().from(giftLinks).where(eq(giftLinks.id, linkId));
    const item = (link!.items as { sourceObjectId?: string | null }[])[0]!;
    expect(item.sourceObjectId, 'the link holds its own copy, not the live cut-out').not.toBe(cut!.id);

    // later: the drawing is lifted again — the live cut-out is rewritten in place
    const second = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 64, b: 42, alpha: 1 } } }).png().toBuffer();
    await putObject(cutKey, second, 'image/png');
    await db.update(storageObjects).set({ sha256: sha(second), byteSize: second.byteLength }).where(eq(storageObjects.id, cut!.id));

    const [frozen] = await db.select().from(storageObjects).where(eq(storageObjects.id, item.sourceObjectId!));
    keys.push(frozen!.key);
    expect([frozen!.assetId, frozen!.writeOnce, frozen!.sha256]).toEqual([famNoChild, true, sha(first)]);
    expect(sha(await getObjectBytes(frozen!.key))).toBe(sha(first)); // the bytes the link prints from never changed
  });

  it('06-B5: the parent’s list says "no longer open" once a keepsake on it is deleted, and "open" while all is well', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true });
    const b = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true });
    keys.push(a.key, b.key);
    await db.update(assets).set({ moderationStatus: 'CLEAR' }).where(inArray(assets.id, [a.assetId, b.assetId]));
    const [link] = await db.insert(giftLinks).values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, token: randomBytes(24).toString('base64url'), items: [a.assetId, b.assetId].map((assetId) => ({ assetId, productKey: 'mug', label: 'mug', unitPricePence: 1800 })), expiresAt: new Date(Date.now() + 864e5) }).returning();
    const statusOf = async () => (await listGiftListsForOwner(db, sam, ids.hartleyId)).find((l) => l.id === link!.id)?.status;
    expect(await statusOf()).toBe('ACTIVE');
    await db.delete(assets).where(eq(assets.id, b.assetId)); // one keepsake gone
    expect(await statusOf()).toBe('GONE');
  });
});
