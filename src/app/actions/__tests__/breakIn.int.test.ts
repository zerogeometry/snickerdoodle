import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';

/**
 * BREAK-IN SWEEP (tester 07, 2026-10-29) — every Server Action that takes an id, called DIRECTLY
 * (exactly what a crafted POST to the action endpoint does) by someone who must not reach it:
 *   · family B's parent with family A's ids (cross-family IDOR),
 *   · inside family A: an EXTENDED member on FAMILY items, the uploading second parent on the child's
 *     ONLY_ME keepsake (the controller is the CONTROLLING parent), a VIEW member trying to contribute,
 *     a REMOVED member,
 *   · and forged arguments (visibility, ownership).
 * Every attack must be refused AND look exactly like "that id doesn't exist" (no existence leak).
 * Positive controls prove each refusal isn't just a broken fixture.
 */

const actor = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string | null } }));
vi.mock('@/server/session', async (orig) => ({
  ...(await orig<typeof import('@/server/session')>()),
  getCurrentAccount: async () => actor.current,
  getUploadClaims: async () => [],
}));
vi.mock('@/auth', () => ({ auth: async () => null, signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '203.0.113.77' }),
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn(), getAll: () => [] }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/server/mail', async (orig) => ({ ...(await orig<typeof import('@/server/mail')>()), sendMail: vi.fn(async () => {}) }));
vi.mock('@/server/rateLimit', async (orig) => ({
  ...(await orig<typeof import('@/server/rateLimit')>()),
  clientIp: async () => '203.0.113.77',
  rateLimit: vi.fn(async () => ({ ok: true, retryAfterSec: 0 })),
}));

import * as schema from '@/db/schema';
import { assets, giftLinks, invites, memberships, occasions, orders, savedDesigns, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { changeAssetVisibility, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { removeBackgroundForAsset } from '@/server/magic';
import { deleteObject } from '@/storage';
import {
  cutoutAlphaAction,
  designUrlAction,
  putBackgroundBackAction,
  removeBackgroundAction,
  saveCutoutMaskAction,
  saveStudioAction,
  studioStateAction,
} from '@/app/actions/magic';
import { copyKeepsakeAction, discardCopyAction, keepsakeForStudioAction } from '@/app/actions/keepsakePicker';
import { deleteKeepsakeAction, keepUploadAction, setAssetVisibilityAction } from '@/app/actions/keep';
import { renderPreviewAction } from '@/app/actions/render';
import { deleteSavedDesignAction, saveDesignAction } from '@/app/actions/designs';
import { reportKeepsakeAction } from '@/app/actions/report';
import { placeOrderAction } from '@/app/actions/order';
import { createGiftLinkAction, sendGiftRequestAction } from '@/app/actions/giftLink';
import {
  deleteChildAction,
  deleteOccasionAction,
  leaveFamilyAction,
  removeMemberAction,
  resendInviteAction,
  revokeGiftLinkAction,
  revokeInviteAction,
  setMemberAccessAction,
  setMemberCalendarAction,
  updateChildAction,
  updateOccasionAction,
} from '@/app/actions/family';
import { setKeepChoiceAction } from '@/app/actions/keepChoice';
import { adoptPendingPlacement } from '@/app/actions/adopt';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

const art = () =>
  sharp({ create: { width: 900, height: 900, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: { create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 64, b: 42 } } }, left: 250, top: 250 }])
    .png()
    .toBuffer();

const TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
const MASK = `data:image/png;base64,${Buffer.from('not-really-a-png').toString('base64')}`;

describe.skipIf(!DB || !S3)('break-in: server actions refuse cross-family + in-family escalation, with no existence leak (integration)', () => {
  const db = getDb() as unknown as import('@/server/db').DbHandle;
  let ids: SeededIds;
  const keys: string[] = [];
  const extraAccounts: string[] = [];
  // family A (Hartleys): Sam owner/controller, Jo 2nd parent (FAMILY/CONTRIBUTE), Rosie (EXTENDED/VIEW_BUY),
  // Mallory (REMOVED), Vic (FAMILY/VIEW). Family B (Blooms): Blake.
  let vicId: string;
  const A = {} as {
    famAsset: string; extAsset: string; childOnlyMe: string; famObj: string; famCutout: string;
    gift: string; giftToken: string; invite: string; occasion: string; design: string; orderRef: string;
  };
  let bAsset: string;
  const acct = (id: string, tag: string) => ({ id, email: `${tag}@example.test`, name: tag });
  const as = (id: string | null) => {
    actor.current = id ? acct(id, id.slice(0, 6)) : null;
  };
  const ghost = () => randomUUID(); // an id that exists nowhere

  beforeAll(async () => {
    ids = await seedDemoFamilies(db);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    const blake = await resolveViewerContext(db, ids.blakeId, ids.bloomId);

    const fam = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true, childSubjectId: ids.oliviaId });
    const ext = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true, childSubjectId: ids.oliviaId });
    // Jo (second parent) uploads a drawing OF OLIVIA → its controller is Sam, Olivia's controlling parent.
    const child = await ingestOriginalAsset(db, jo, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(), keptInHome: true, childSubjectId: ids.oliviaId });
    const b = await ingestOriginalAsset(db, blake, { familyId: ids.bloomId, kind: 'DRAWING', buffer: await art(), keptInHome: true });
    keys.push(fam.key, ext.key, child.key, b.key);
    A.famAsset = fam.assetId;
    A.extAsset = ext.assetId;
    A.childOnlyMe = child.assetId;
    bAsset = b.assetId;
    await changeAssetVisibility(db, ext.assetId, sam, 'EXTENDED');
    await changeAssetVisibility(db, child.assetId, sam, 'ONLY_ME');
    await db.update(assets).set({ moderationStatus: 'CLEAR' }).where(inArray(assets.id, [fam.assetId, ext.assetId, child.assetId, b.assetId]));

    const [obj] = await db.select().from(storageObjects).where(eq(storageObjects.assetId, fam.assetId));
    A.famObj = obj!.id;
    const cut = await removeBackgroundForAsset(db, sam, fam.assetId);
    keys.push(cut.key);
    A.famCutout = cut.objectId;

    // Vic: FAMILY circle but VIEW access only (from a verified invite).
    vicId = randomUUID();
    extraAccounts.push(vicId);
    await db.insert(schema.accounts).values({ id: vicId, email: `vic-${randomBytes(3).toString('hex')}@example.test` });
    const [inv] = await db
      .insert(invites)
      .values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, email: `vic@example.test`, relationship: 'CLOSE_FRIEND', circle: 'FAMILY', accessLevel: 'VIEW', token: `tok-vic-${randomBytes(8).toString('hex')}`, status: 'VERIFIED', expiresAt: new Date(Date.now() + 864e5) })
      .returning();
    await db.insert(memberships).values({ familyId: ids.hartleyId, accountId: vicId, relationship: 'CLOSE_FRIEND', circle: 'FAMILY', accessLevel: 'VIEW', status: 'ACTIVE', inviteId: inv!.id });

    // family A's other ids: a PENDING invite, a gift link, an occasion, a saved design, an order
    const [pend] = await db
      .insert(invites)
      .values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, email: `pending-${randomBytes(3).toString('hex')}@example.test`, relationship: 'AUNT_UNCLE', circle: 'EXTENDED', accessLevel: 'VIEW', token: `tok-pend-${randomBytes(8).toString('hex')}`, status: 'PENDING', expiresAt: new Date(Date.now() + 864e5) })
      .returning();
    A.invite = pend!.id;
    A.giftToken = randomBytes(24).toString('base64url');
    const [g] = await db
      .insert(giftLinks)
      .values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, token: A.giftToken, items: [{ assetId: fam.assetId, productKey: 'mug', label: 'mug', unitPricePence: 1800 }], expiresAt: new Date(Date.now() + 864e5) })
      .returning();
    A.gift = g!.id;
    const [o] = await db.insert(occasions).values({ familyId: ids.hartleyId, title: 'Olivia', kind: 'BIRTHDAY', month: 5, day: 4, childId: ids.oliviaId, createdByAccountId: ids.samId }).returning();
    A.occasion = o!.id;
    const [d] = await db.insert(savedDesigns).values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, assetId: fam.assetId, variantSku: 'mug', transform: TRANSFORM }).returning();
    A.design = d!.id;
    A.orderRef = `SD-T7-${randomBytes(3).toString('hex').toUpperCase()}`;
    await db.insert(orders).values({ ref: A.orderRef, accountId: ids.samId, familyId: ids.hartleyId, status: 'PAID', subtotalPence: 1800, deliveryPence: 0, totalPence: 1800 });
  }, 120_000);

  afterAll(async () => {
    if (!ids) return;
    await db.delete(orders).where(eq(orders.ref, A.orderRef)).catch(() => {});
    await db.delete(savedDesigns).where(eq(savedDesigns.familyId, ids.hartleyId)).catch(() => {});
    await db.delete(occasions).where(eq(occasions.familyId, ids.hartleyId)).catch(() => {});
    await db.delete(giftLinks).where(eq(giftLinks.familyId, ids.hartleyId)).catch(() => {});
    for (const k of keys) await deleteObject(k).catch(() => {});
    await db.delete(memberships).where(inArray(memberships.accountId, extraAccounts)).catch(() => {});
    await cleanupDemoFamilies(db, ids).catch(() => {});
  });

  /** Refused AND indistinguishable from a made-up id. */
  async function refusedLikeGhost<T>(call: (id: string) => Promise<T>, realId: string) {
    const real = await call(realId);
    const fake = await call(ghost());
    expect(real, 'refused').toMatchObject({ ok: false });
    expect(real, 'same answer as an id that does not exist').toEqual(fake);
    return real;
  }

  describe('family B (Blake) with family A ids', () => {
    beforeAll(() => as(ids.blakeId));
    afterAll(() => as(null));

    it('magic edits: remove background / put back / cutout mask / touch-up save / studio state / studio save', async () => {
      await refusedLikeGhost((id) => removeBackgroundAction({ assetId: id }), A.famAsset);
      await refusedLikeGhost((id) => putBackgroundBackAction({ assetId: id, sourceObjectId: A.famCutout }), A.famAsset);
      await refusedLikeGhost((id) => cutoutAlphaAction({ assetId: id }), A.famAsset);
      await refusedLikeGhost((id) => saveCutoutMaskAction({ assetId: id, mask: MASK }), A.famAsset);
      await refusedLikeGhost((id) => studioStateAction({ assetId: id }), A.famAsset);
      await refusedLikeGhost((id) => saveStudioAction({ assetId: id, mask: null, geometry: {} as never }), A.famAsset);
      // the cutout object is still there (put-back didn't delete family A's derivative)
      expect((await db.select().from(storageObjects).where(eq(storageObjects.id, A.famCutout))).length).toBe(1);
    });

    it('signed URL for a stored object: A’s pair, AND B’s own asset paired with A’s object id (mixed pair)', async () => {
      await refusedLikeGhost((id) => designUrlAction({ assetId: id, sourceObjectId: A.famCutout }), A.famAsset);
      await refusedLikeGhost((obj) => designUrlAction({ assetId: bAsset, sourceObjectId: obj }), A.famCutout);
      await refusedLikeGhost((obj) => designUrlAction({ assetId: bAsset, sourceObjectId: obj }), A.famObj);
      // positive control: Blake CAN mint for his own drawing
      const [bObj] = await db.select().from(storageObjects).where(eq(storageObjects.assetId, bAsset));
      expect(await designUrlAction({ assetId: bAsset, sourceObjectId: bObj!.id })).toMatchObject({ ok: true });
    });

    it('studio open / copy / discard / render / keep / visibility / delete', async () => {
      await refusedLikeGhost((id) => keepsakeForStudioAction({ assetId: id }), A.famAsset);
      await refusedLikeGhost((id) => copyKeepsakeAction({ assetId: id }), A.famAsset);
      await refusedLikeGhost((id) => copyKeepsakeAction({ assetId: id, removeBackground: true }), A.famAsset);
      await refusedLikeGhost((id) => discardCopyAction({ assetId: id }), A.famAsset);
      await refusedLikeGhost((id) => renderPreviewAction({ assetId: id, variantId: ghost(), transform: TRANSFORM }), A.famAsset);
      await refusedLikeGhost((id) => keepUploadAction(id), A.famAsset);
      await refusedLikeGhost((id) => setAssetVisibilityAction(id, 'EXTENDED'), A.famAsset);
      await refusedLikeGhost((id) => deleteKeepsakeAction(id), A.famAsset);
      const [row] = await db.select().from(assets).where(eq(assets.id, A.famAsset));
      expect(row).toMatchObject({ visibility: 'FAMILY', familyId: ids.hartleyId, controllerAccountId: ids.samId });
      // positive control: Blake opens his own
      expect(await keepsakeForStudioAction({ assetId: bAsset })).toMatchObject({ ok: true });
    });

    it('saved designs, report, adopt, order with A’s keepsake as artwork', async () => {
      // refused — but NOT like a made-up id ('error' vs 'not-found'): bug 07-B1, pinned in breakInFamily.int.test.ts
      expect(await saveDesignAction({ assetId: A.famAsset, variantSku: 'mug', transform: TRANSFORM })).toMatchObject({ ok: false });
      expect((await db.select().from(savedDesigns).where(eq(savedDesigns.assetId, A.famAsset))).length).toBe(1); // only Sam's
      await refusedLikeGhost((id) => deleteSavedDesignAction(id), A.design);
      expect((await db.select().from(savedDesigns).where(eq(savedDesigns.id, A.design))).length).toBe(1);
      await refusedLikeGhost((id) => reportKeepsakeAction({ assetId: id, reason: 'other', note: 'x' }), A.famAsset);
      await refusedLikeGhost((id) => adoptPendingPlacement({ assetId: id, variantId: ghost(), transform: TRANSFORM }), A.famAsset);
      await refusedLikeGhost((id) => placeOrderAction({ items: [{ productKey: 'mug', qty: 1, artwork: { assetId: id, transform: TRANSFORM } }] }), A.famAsset);
      const [row] = await db.select().from(assets).where(eq(assets.id, A.famAsset));
      expect(row!.familyId).toBe(ids.hartleyId); // not "filed" into Blake's home by the order attempt
      expect(row!.moderationStatus).toBe('CLEAR'); // not held for review by an outsider's report
    });

    it('gift links: make one from A’s keepsakes, send A’s link, revoke A’s link', async () => {
      await refusedLikeGhost((id) => createGiftLinkAction({ assetIds: [id] }), A.famAsset);
      await refusedLikeGhost((id) => sendGiftRequestAction({ linkId: id, memberAccountIds: [], emails: ['x@example.test'] }), A.gift);
      await refusedLikeGhost((id) => revokeGiftLinkAction(id), A.gift);
      expect((await db.select().from(giftLinks).where(eq(giftLinks.id, A.gift)))[0]!.status).toBe('ACTIVE');
    });

    it('family admin: remove / re-circle a member, calendar, invites, children, occasions, leave, keep-choice', async () => {
      await refusedLikeGhost((id) => removeMemberAction(id), ids.joId);
      await refusedLikeGhost((id) => setMemberAccessAction(id, { circle: 'EXTENDED', accessLevel: 'VIEW' }), ids.joId);
      await refusedLikeGhost((id) => setMemberCalendarAction(id, true), ids.joId);
      await refusedLikeGhost((id) => revokeInviteAction(id), A.invite);
      await refusedLikeGhost((id) => resendInviteAction(id), A.invite);
      await refusedLikeGhost((id) => updateChildAction(id, { firstName: 'Pwned' }), ids.oliviaId);
      await refusedLikeGhost((id) => deleteChildAction(id, true), ids.oliviaId);
      await refusedLikeGhost((id) => updateOccasionAction(id, { title: 'x', kind: 'OTHER', month: 1, day: 1 } as never), A.occasion);
      await refusedLikeGhost((id) => deleteOccasionAction(id), A.occasion);
      await refusedLikeGhost((id) => leaveFamilyAction(id), ids.hartleyId);
      await refusedLikeGhost((ref) => setKeepChoiceAction(ref, false), A.orderRef);
      // nothing changed in family A
      const [jo] = await db.select().from(memberships).where(eq(memberships.accountId, ids.joId));
      expect(jo).toMatchObject({ status: 'ACTIVE', circle: 'FAMILY', accessLevel: 'CONTRIBUTE' });
      expect((await db.select().from(invites).where(eq(invites.id, A.invite)))[0]!.status).toBe('PENDING');
      expect((await db.select().from(schema.children).where(eq(schema.children.id, ids.oliviaId)))[0]!.firstName).toBe('Olivia');
      expect((await db.select().from(occasions).where(eq(occasions.id, A.occasion))).length).toBe(1);
    });
  });

  describe('inside family A', () => {
    afterAll(() => as(null));

    it('EXTENDED-circle Rosie cannot reach a FAMILY keepsake (but can the EXTENDED one)', async () => {
      as(ids.rosieId);
      expect(await keepsakeForStudioAction({ assetId: A.famAsset })).toEqual({ ok: false });
      expect(await studioStateAction({ assetId: A.famAsset })).toEqual({ ok: false });
      expect(await designUrlAction({ assetId: A.famAsset, sourceObjectId: A.famCutout })).toEqual({ ok: false });
      expect(await designUrlAction({ assetId: A.extAsset, sourceObjectId: A.famObj })).toEqual({ ok: false }); // mixed pair
      expect(await keepsakeForStudioAction({ assetId: A.extAsset })).toMatchObject({ ok: true }); // control
    });

    it('the second parent who UPLOADED the child’s drawing cannot see / change / delete it once the controlling parent made it ONLY_ME', async () => {
      as(ids.joId);
      expect(await keepsakeForStudioAction({ assetId: A.childOnlyMe })).toEqual({ ok: false });
      expect(await studioStateAction({ assetId: A.childOnlyMe })).toEqual({ ok: false });
      expect(await setAssetVisibilityAction(A.childOnlyMe, 'FAMILY')).toEqual({ ok: false });
      expect(await deleteKeepsakeAction(A.childOnlyMe)).toEqual({ ok: false });
      expect(await copyKeepsakeAction({ assetId: A.childOnlyMe })).toEqual({ ok: false });
      const [row] = await db.select().from(assets).where(eq(assets.id, A.childOnlyMe));
      expect(row).toMatchObject({ visibility: 'ONLY_ME', controllerAccountId: ids.samId, uploaderAccountId: ids.joId });
      as(ids.samId); // the controlling parent can
      expect(await keepsakeForStudioAction({ assetId: A.childOnlyMe })).toMatchObject({ ok: true });
    });

    it('a VIEW member can look but not contribute (copy = a new keepsake) nor manage', async () => {
      as(vicId);
      expect(await keepsakeForStudioAction({ assetId: A.famAsset })).toMatchObject({ ok: true }); // can see
      expect(await copyKeepsakeAction({ assetId: A.famAsset })).toMatchObject({ ok: false });
      expect(await setAssetVisibilityAction(A.famAsset, 'EXTENDED')).toEqual({ ok: false });
      expect(await deleteKeepsakeAction(A.famAsset)).toEqual({ ok: false });
      expect(await removeMemberAction(ids.joId)).toEqual({ ok: false });
    });

    it('a REMOVED member sees nothing, even the EXTENDED keepsake', async () => {
      as(ids.malloryId);
      expect(await keepsakeForStudioAction({ assetId: A.extAsset })).toEqual({ ok: false });
      expect(await designUrlAction({ assetId: A.extAsset, sourceObjectId: A.famObj })).toEqual({ ok: false });
      expect(await copyKeepsakeAction({ assetId: A.extAsset })).toMatchObject({ ok: false });
    });

    it('forged visibility: no tier outside the enum (e.g. PUBLIC) is ever stored', async () => {
      as(ids.samId);
      for (const tier of ['PUBLIC', 'public', '', 'EXTENDED; drop table assets'] as never[]) {
        await setAssetVisibilityAction(A.famAsset, tier).catch(() => ({ ok: false }));
        expect((await db.select().from(assets).where(eq(assets.id, A.famAsset)))[0]!.visibility).toBe('FAMILY');
      }
    });

    it('anonymous visitor: every id-taking action refuses', async () => {
      as(null);
      expect(await keepsakeForStudioAction({ assetId: A.famAsset })).toEqual({ ok: false });
      expect(await designUrlAction({ assetId: A.famAsset, sourceObjectId: A.famObj })).toEqual({ ok: false });
      expect(await studioStateAction({ assetId: A.famAsset })).toEqual({ ok: false });
      expect(await renderPreviewAction({ assetId: A.famAsset, variantId: ghost(), transform: TRANSFORM })).toMatchObject({ ok: false });
      expect(await setAssetVisibilityAction(A.famAsset, 'EXTENDED')).toEqual({ ok: false });
      expect(await deleteKeepsakeAction(A.famAsset)).toEqual({ ok: false });
    });
  });
});
