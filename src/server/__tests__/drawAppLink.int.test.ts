import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { appAuthCodes, appCheckoutGrants, appTokens, assets, auditRecords, children, memberships, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { seedCatalogue } from '@/server/catalogue';
import { closeAccount, handOverFamily } from '@/server/accountClosure';
import { removeMember } from '@/server/members';
import { resolveViewerContext } from '@/server/assets';
import { deleteObject } from '@/storage';
import type { BackgroundTask } from '@/server/background';
import type { DbHandle } from '@/server/db';
import { AppAuthError, requireAppViewer, type AppViewer } from '@/server/app/appAuth';
import { createAuthCode, exchangeAuthCode, listLinkedDevices, revokeAppTokens, type ConnectRequest } from '@/server/app/link';
import {
  addAppChild,
  AppApiError,
  consumeAppCheckoutGrant,
  deleteAppAsset,
  getAppMe,
  keepAppDrawing,
  listAppOrders,
  listAppProducts,
  mintAppCheckoutGrant,
  updateAppChild,
} from '@/server/app/api';
import { s256 } from '@/server/app/secrets';

/**
 * Snickerdoodle Draw ↔ the website: linking, the phone's narrow key, and what it may do
 * (COMPANION-APP-api-plan.md §5). A change touching ownership, visibility and deletion, so it ships
 * with these (CLAUDE.md). Real Postgres; the upload cases need MinIO too. No real child's image:
 * the "drawings" are flat colour squares made here.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const ON = { DRAW_APP_UPLOADS: 'on' };

const VERIFIER = 'a'.repeat(20) + 'B'.repeat(20) + '-._~xyz'; // 47 unreserved chars
const REQ: ConnectRequest = { codeChallenge: s256(VERIFIER), state: 'st8', redirectUri: 'https://snickerdoodle.co.uk/app/callback' };
const png = (w = 600, h = 800) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 230, g: 120, b: 110 } } }).png().toBuffer();
const blob = async (buf?: Buffer) => new Blob([new Uint8Array(buf ?? (await png()))], { type: 'image/png' });
const queued = (): { tasks: BackgroundTask[]; screening: { background: (t: BackgroundTask) => void } } => {
  const tasks: BackgroundTask[] = [];
  return { tasks, screening: { background: (t) => tasks.push(t) } };
};

async function expectApiError(p: Promise<unknown>, status: number, reason: string) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppApiError);
  expect({ status: (e as AppApiError).status, reason: (e as AppApiError).reason }).toEqual({ status, reason });
}
async function expectLinkGone(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppAuthError);
}

describe.skipIf(!DB)('Snickerdoodle Draw: linking and the phone’s key (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const madeAssets: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });
  afterAll(async () => {
    if (madeAssets.length) for (const o of await db.select().from(storageObjects).where(inArray(storageObjects.assetId, madeAssets))) await deleteObject(o.key).catch(() => {});
    if (ids) {
      await db.delete(appTokens).where(inArray(appTokens.accountId, [ids.samId, ids.joId, ids.blakeId]));
      await db.delete(appAuthCodes).where(inArray(appAuthCodes.accountId, [ids.samId, ids.joId, ids.blakeId]));
      await cleanupDemoFamilies(db, ids);
    }
    await client.end();
  });

  /** Sam (Hartley's owner) links a phone; returns the raw key. */
  async function link(opts: { accountId?: string; familyId?: string | null; childIds?: string[] | null; ua?: string } = {}) {
    const code = await createAuthCode(db, { accountId: opts.accountId ?? ids.samId, familyId: opts.familyId === undefined ? ids.hartleyId : opts.familyId, childIds: opts.childIds ?? null, req: REQ });
    const res = await exchangeAuthCode(db, { grantType: 'authorization_code', code, codeVerifier: VERIFIER, redirectUri: REQ.redirectUri, clientId: 'snickerdoodle-draw', userAgent: opts.ua ?? 'okhttp/4.12.0' });
    if (!res.ok) throw new Error(`link failed: ${res.reason}`);
    return res.token;
  }
  const viewerFor = (token: string, now?: Date) => requireAppViewer(db, `Bearer ${token}`, now);
  const swap = (code: string, patch: Record<string, unknown> = {}) =>
    exchangeAuthCode(db, { grantType: 'authorization_code', code, codeVerifier: VERIFIER, redirectUri: REQ.redirectUri, clientId: 'snickerdoodle-draw', ...patch });

  // ── linking (PKCE) ──────────────────────────────────────────────────────────────────────────────

  describe('linking', () => {
    it('the owner links: one key, audited, and the phone sees the family name + first names only', async () => {
      const token = await link();
      expect(token).toMatch(/^sdd_/);
      const [row] = await db.select().from(appTokens).where(eq(appTokens.accountId, ids.samId));
      expect(row!.tokenHash).not.toContain(token.slice(4)); // stored as a hash only
      const audit = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'APP_LINKED'), eq(auditRecords.targetId, row!.id)));
      expect(audit).toHaveLength(1);
      const me = await getAppMe(db, await viewerFor(token));
      expect(Object.keys(me).sort()).toEqual(['children', 'family']);
      expect(me.children.map((c) => c.id).sort()).toEqual([ids.oliviaId, ids.maxId].sort());
      for (const c of me.children) expect(Object.keys(c).every((k) => ['id', 'firstName', 'birthday'].includes(k))).toBe(true);
      expect(JSON.stringify(me)).not.toMatch(/@/); // no email of anyone
    });

    it('a code works once — a second swap fails', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ });
      expect((await swap(code)).ok).toBe(true);
      expect(await swap(code)).toEqual({ ok: false, status: 400, reason: 'invalid-grant' });
    });

    it('a wrong verifier fails, and burns the code (no second guess)', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ });
      expect(await swap(code, { codeVerifier: `${VERIFIER.slice(0, -1)}Q` })).toEqual({ ok: false, status: 400, reason: 'invalid-grant' });
      expect((await swap(code)).ok).toBe(false);
    });

    it('an expired code fails', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ }, new Date(Date.now() - 5 * 60_000));
      expect(await swap(code)).toEqual({ ok: false, status: 400, reason: 'invalid-grant' });
    });

    it('a different return address than the one the code was made for fails', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ });
      expect(await swap(code, { redirectUri: 'snickerdoodle-draw://auth/callback' })).toEqual({ ok: false, status: 400, reason: 'invalid-grant' });
    });

    it('the wrong app, grant type or a missing field is refused before anything is looked up', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ });
      expect(await swap(code, { clientId: 'other' })).toEqual({ ok: false, status: 400, reason: 'invalid-request' });
      expect(await swap(code, { grantType: 'password' })).toEqual({ ok: false, status: 400, reason: 'invalid-request' });
      expect(await swap(code, { codeVerifier: undefined })).toEqual({ ok: false, status: 400, reason: 'invalid-request' });
      expect((await swap(code)).ok).toBe(true); // none of those burned it
    });

    it('only the family’s OWNER can link: a member is refused a code; "no family" swaps to 403 not-owner', async () => {
      await expect(createAuthCode(db, { accountId: ids.joId, familyId: ids.hartleyId, childIds: null, req: REQ })).rejects.toThrow();
      await expect(createAuthCode(db, { accountId: ids.samId, familyId: ids.bloomId, childIds: null, req: REQ })).rejects.toThrow(); // not Sam's family
      const code = await createAuthCode(db, { accountId: ids.joId, familyId: null, childIds: null, req: REQ });
      expect(await swap(code)).toEqual({ ok: false, status: 403, reason: 'not-owner' });
    });

    it('ticked children are re-checked: another family’s child id is dropped; all ticked = every child', async () => {
      const t1 = await link({ childIds: [ids.oliviaId, 'b4a3f7a0-0000-4000-8000-000000000000'] });
      expect((await viewerFor(t1)).childIds).toEqual([ids.oliviaId]);
      const t2 = await link({ childIds: [ids.oliviaId, ids.maxId] });
      expect((await viewerFor(t2)).childIds).toBeNull();
    });
  });

  // ── the key ───────────────────────────────────────────────────────────────────────────────────────

  describe('the key, on every call', () => {
    it('no key, a malformed one or an unknown one → 401', async () => {
      await expectLinkGone(requireAppViewer(db, null));
      await expectLinkGone(requireAppViewer(db, 'Bearer nope'));
      await expectLinkGone(requireAppViewer(db, `Bearer sdd_${'x'.repeat(43)}`));
      await expectLinkGone(requireAppViewer(db, `Basic ${'x'.repeat(43)}`));
    });

    it('unlinking (in the app) stops the key at once; the account page no longer lists it', async () => {
      const token = await link({ ua: 'SnickerdoodleDraw CFNetwork Darwin' });
      const av = await viewerFor(token);
      expect((await listLinkedDevices(db, ids.samId)).some((d) => d.id === av.tokenId && d.label === 'an iphone or ipad')).toBe(true);
      await revokeAppTokens(db, { tokenId: av.tokenId }, 'unlinked-in-app', { accountId: ids.samId, actorType: 'MEMBER' });
      await expectLinkGone(viewerFor(token));
      expect((await listLinkedDevices(db, ids.samId)).some((d) => d.id === av.tokenId)).toBe(false);
    });

    it('a key left unused for 90 days stops (and stays stopped)', async () => {
      const token = await link();
      await expectLinkGone(viewerFor(token, new Date(Date.now() + 91 * 86_400_000)));
      await expectLinkGone(viewerFor(token));
    });

    it('if the owner’s membership stops being ACTIVE the key stops on the next call — no grace, and it never comes back', async () => {
      const token = await link();
      await viewerFor(token);
      await db.update(memberships).set({ status: 'LEFT' }).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.samId)));
      try {
        await expectLinkGone(viewerFor(token));
      } finally {
        await db.update(memberships).set({ status: 'ACTIVE' }).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.samId)));
      }
      await expectLinkGone(viewerFor(token)); // revoked, not just refused
    });

    it('removing a member also revokes any key of theirs for that family', async () => {
      // (only owners can link, so plant one directly to prove the hook)
      await db.insert(appTokens).values({ tokenHash: 'planted-jo', accountId: ids.joId, familyId: ids.hartleyId, deviceLabel: 'a phone or tablet' });
      await removeMember(db, await resolveViewerContext(db, ids.samId, ids.hartleyId), { familyId: ids.hartleyId, memberAccountId: ids.joId });
      const [row] = await db.select().from(appTokens).where(eq(appTokens.tokenHash, 'planted-jo'));
      expect(row!.revokedAt).not.toBeNull();
      // put Jo back as she was for the other cases
      await db.update(memberships).set({ status: 'ACTIVE', revokedAt: null }).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.joId)));
    });
  });

  // ── what the key can reach ────────────────────────────────────────────────────────────────────────

  describe('scope: one family, and only the ticked children', () => {
    let scoped: AppViewer;
    beforeAll(async () => {
      scoped = await viewerFor(await link({ childIds: [ids.oliviaId] }));
    });

    it('/me shows only the ticked child', async () => {
      expect((await getAppMe(db, scoped)).children.map((c) => c.id)).toEqual([ids.oliviaId]);
    });

    it('an unticked child or another family’s child can’t be changed', async () => {
      await expectApiError(updateAppChild(db, scoped, ids.maxId, { firstName: 'Maxi' }), 404, 'not-found');
      const all = await viewerFor(await link());
      const [bloomChild] = await db.insert(children).values({ familyId: ids.bloomId, firstName: 'Bea', controllerAccountId: ids.blakeId }).returning();
      await expectApiError(updateAppChild(db, all, bloomChild!.id, { firstName: 'Bee' }), 404, 'not-found');
    });

    it('a child added in the app joins the phone’s list; a surname is refused', async () => {
      const kid = await addAppChild(db, scoped, { firstName: 'Ellie', birthday: '2021-04-02' });
      expect(kid).toEqual({ id: expect.any(String), firstName: 'Ellie', birthday: '2021-04-02' });
      const [tok] = await db.select().from(appTokens).where(eq(appTokens.id, scoped.tokenId));
      expect(tok!.childIds).toEqual([ids.oliviaId, kid.id]);
      await expectApiError(addAppChild(db, scoped, { firstName: 'Ellie Hartley' }), 422, 'name');
    });

    it('updating a ticked child goes through the website’s rules', async () => {
      expect(await updateAppChild(db, scoped, ids.oliviaId, { birthday: '2020-06-01' })).toMatchObject({ id: ids.oliviaId, birthday: '2020-06-01' });
      await expectApiError(updateAppChild(db, scoped, ids.oliviaId, { firstName: 'Olivia Smith' }), 422, 'name');
    });
  });

  // ── keep it / delete / make it real ──────────────────────────────────────────────────────────────

  describe.skipIf(!S3)('keep it (uploads), delete, make it real', () => {
    let av: AppViewer;
    let kept: string;
    beforeAll(async () => {
      av = await viewerFor(await link());
    });

    it('OFF until DRAW_APP_UPLOADS=on (the Children’s Code sign-off)', async () => {
      await expectApiError(keepAppDrawing(db, av, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen' }, { env: {} }), 403, 'not-yet');
    });

    it('keeps the drawing exactly as a website upload: FAMILY, kept, the child’s parent controls it, checks run after', async () => {
      const q = queued();
      const res = await keepAppDrawing(db, av, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-08', source: 'app-paper' }, { env: ON, screening: q.screening });
      madeAssets.push(res.assetId);
      kept = res.assetId;
      expect(res).toEqual({ assetId: expect.any(String), kept: true }); // never a moderation status
      const [row] = await db.select().from(assets).where(eq(assets.id, res.assetId));
      expect(row).toMatchObject({ familyId: ids.hartleyId, visibility: 'FAMILY', keptInHome: true, purgeAfter: null, source: 'app-paper', madeOn: '2026-11-08', childSubjectId: ids.oliviaId, controllerAccountId: ids.samId, moderationStatus: 'PENDING' });
      const [orig] = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, res.assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
      expect(orig!.exifStripped).toBe(true);
      expect(q.tasks.length).toBeGreaterThan(0); // the safety checks were queued, not skipped
    });

    it('refuses what isn’t a picture, a child outside the key, a bad date, a bad source, and anything over 20 MB', async () => {
      await expectApiError(keepAppDrawing(db, av, { image: new Blob([new Uint8Array(Buffer.from('%PDF-1.7 not a drawing'))]), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen' }, { env: ON }), 415, 'image');
      await expectApiError(keepAppDrawing(db, av, { image: await blob(), childId: 'b4a3f7a0-0000-4000-8000-000000000000', madeOn: '2026-11-09', source: 'app-screen' }, { env: ON }), 422, 'child');
      await expectApiError(keepAppDrawing(db, av, { image: await blob(), childId: ids.oliviaId, madeOn: 'yesterday', source: 'app-screen' }, { env: ON }), 422, 'made-on');
      await expectApiError(keepAppDrawing(db, av, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'web' }, { env: ON }), 422, 'source');
      await expectApiError(keepAppDrawing(db, av, { image: new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen' }, { env: ON }), 413, 'too-big');
      const scoped = await viewerFor(await link({ childIds: [ids.oliviaId] }));
      await expectApiError(keepAppDrawing(db, scoped, { image: await blob(), childId: ids.maxId, madeOn: '2026-11-09', source: 'app-screen' }, { env: ON }), 422, 'child');
    });

    it('make it real: a single-use, 15-minute pass for THIS keepsake × product, only for the same grown-up, signed in', async () => {
      const g = await mintAppCheckoutGrant(db, av, { assetId: kept, productKey: 'framedPrint' });
      expect(g.url).toMatch(/\/app\/checkout\/sdg_[A-Za-z0-9_-]{43}$/);
      expect(Object.keys(g).sort()).toEqual(['expiresAt', 'url']); // never a price
      const pass = g.url.split('/').pop()!;
      expect(await consumeAppCheckoutGrant(db, pass, ids.joId)).toEqual({ ok: false, reason: 'other-account' }); // another grown-up — and it isn't burned
      expect(await consumeAppCheckoutGrant(db, pass, ids.samId)).toEqual({ ok: true, assetId: kept, productKey: 'framedPrint' });
      expect(await consumeAppCheckoutGrant(db, pass, ids.samId)).toEqual({ ok: false, reason: 'gone' }); // once
    });

    it('a pass expires after 15 minutes', async () => {
      const g = await mintAppCheckoutGrant(db, av, { assetId: kept, productKey: 'framedPrint' }, new Date(Date.now() - 16 * 60_000));
      expect(await consumeAppCheckoutGrant(db, g.url.split('/').pop()!, ids.samId)).toEqual({ ok: false, reason: 'gone' });
    });

    it('a pass needs a product the shop shows, and a keepsake the APP sent in the key’s family', async () => {
      await expectApiError(mintAppCheckoutGrant(db, av, { assetId: kept, productKey: 'notAThing' }), 422, 'product');
      await expectApiError(mintAppCheckoutGrant(db, av, { assetId: ids.assetFamily, productKey: 'framedPrint' }), 404, 'not-found'); // a website upload
      await expectApiError(mintAppCheckoutGrant(db, av, { assetId: ids.assetBloomFamily, productKey: 'framedPrint' }), 404, 'not-found'); // another family
    });

    it('the key can delete only what the app sent: a website keepsake and another family’s are out of reach', async () => {
      await expectApiError(deleteAppAsset(db, av, ids.assetFamily), 404, 'not-found');
      await expectApiError(deleteAppAsset(db, av, ids.assetBloomFamily), 404, 'not-found');
      await expectApiError(deleteAppAsset(db, av, 'not-a-uuid'), 404, 'not-found');
      expect((await db.select().from(assets).where(eq(assets.id, ids.assetFamily))).length).toBe(1);
    });

    it('deleting an app keepsake is the real, cascading delete (row, bytes, any pass)', async () => {
      await mintAppCheckoutGrant(db, av, { assetId: kept, productKey: 'framedPrint' });
      await deleteAppAsset(db, av, kept);
      expect(await db.select().from(assets).where(eq(assets.id, kept))).toHaveLength(0);
      expect(await db.select().from(storageObjects).where(eq(storageObjects.assetId, kept))).toHaveLength(0);
      expect(await db.select().from(appCheckoutGrants).where(eq(appCheckoutGrants.assetId, kept))).toHaveLength(0);
      const audit = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'ASSET_DELETED'), eq(auditRecords.targetId, kept)));
      expect(audit).toHaveLength(1);
    });
  });

  // ── what crosses the line ─────────────────────────────────────────────────────────────────────────

  describe('nothing extra crosses', () => {
    it('/products: shop-visible names and blurbs — no prices, no variants', async () => {
      const list = await listAppProducts(db);
      expect(list.length).toBeGreaterThan(0);
      for (const p of list) expect(Object.keys(p).sort()).toEqual(['blurb', 'key', 'label']);
      expect(JSON.stringify(list)).not.toMatch(/price|pence|£/i);
    });

    it('/orders: reference, day and status only', async () => {
      const av = await viewerFor(await link());
      for (const o of await listAppOrders(db, av)) expect(Object.keys(o).sort()).toEqual(['id', 'placedOn', 'status']);
    });
  });

  // ── handover and closure (last: they change the seeded families) ─────────────────────────────────

  describe.skipIf(!S3)('handover and account closure stop the keys', () => {
    it('handing the family over stops the outgoing owner’s keys for it', async () => {
      const token = await link();
      const res = await handOverFamily(db, ids.samId, { familyId: ids.hartleyId, newOwnerAccountId: ids.joId }, new Date(), { skipLedger: true });
      expect(res.ok).toBe(true);
      await expectLinkGone(viewerFor(token));
    });

    it('closing an account stops every key it had', async () => {
      const token = await link({ accountId: ids.blakeId, familyId: ids.bloomId });
      await viewerFor(token);
      const res = await closeAccount(db, ids.blakeId, new Date(), { skipLedger: true });
      expect(res.ok).toBe(true);
      await expectLinkGone(viewerFor(token));
    });
  });
});
