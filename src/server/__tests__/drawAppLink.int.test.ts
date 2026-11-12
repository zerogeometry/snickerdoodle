import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The safety checks the website runs, made controllable here: by default they pass (like the dev
// stub); a case can make the classifier flag, or fail, to prove a held app upload stays held.
const screen = vi.hoisted(() => ({ verdict: 'pass' as 'pass' | 'flag' | 'fail' }));
vi.mock('@/server/moderation/providers', async (orig) => {
  const real = await orig<typeof import('@/server/moderation/providers')>();
  return {
    ...real,
    defaultProviders: () => ({
      hash: { isKnownIllegal: async () => false },
      classifier: {
        classify: async () => {
          if (screen.verdict === 'fail') throw new Error('classifier down');
          return screen.verdict === 'flag' ? { flagged: true, labels: ['Suggestive'], categories: ['Suggestive'] } : { flagged: false, labels: [] };
        },
      },
      textReader: { read: async () => [] },
    }),
  };
});
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { appArtistProgress, appAuthCodes, appCheckoutGrants, appTokens, assets, auditRecords, children, giftLinks, memberships, occasions, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { seedCatalogue } from '@/server/catalogue';
import { closeAccount, handOverFamily } from '@/server/accountClosure';
import { removeMember } from '@/server/members';
import { resolveViewerContext } from '@/server/assets';
import { deleteObject } from '@/storage';
import type { BackgroundTask } from '@/server/background';
import type { DbHandle } from '@/server/db';
import { AppAuthError, requireAppViewer, type AppViewer } from '@/server/app/appAuth';
import { createAuthCode, exchangeAuthCode, listLinkedDevices, purgeAppLinkLeftovers, revokeAppTokens, type ConnectRequest } from '@/server/app/link';
import { countDrawSent, deleteProgressBackups, listProgressBackups, removeEverythingDrawSent, updateSyncFromWebsite, type SyncChoices } from '@/server/app/sync';
import { addAppOccasion, deleteAppOccasion, listAppOccasions, updateAppOccasion } from '@/server/app/occasions';
import { addOccasion, occasionsFor, updateOccasion } from '@/server/occasions';
import { reviewQueue } from '@/server/admin/review';
import { placeOrder } from '@/server/orders';
import {
  addAppChild,
  AppApiError,
  consumeAppCheckoutGrant,
  deleteAppAsset,
  getAppMe,
  getAppProgress,
  keepAppDrawing,
  listAppOrders,
  listAppProducts,
  mintAppCheckoutGrant,
  mintAppWish,
  putAppProgress,
  updateAppChild,
  updateAppSync,
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
/** The choices most cases link with: nothing automatic, names + birthdays kept in step. */
const NAMES: SyncChoices = { keepsakes: 'none', children: true, progress: false, birthdays: false };
const NOTHING: SyncChoices = { keepsakes: 'none', children: false, progress: false, birthdays: false };
const EVERYTHING: SyncChoices = { keepsakes: 'all', children: true, progress: true, birthdays: true };

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
      await db.delete(appArtistProgress).where(inArray(appArtistProgress.familyId, [ids.hartleyId, ids.bloomId]));
      await db.delete(giftLinks).where(inArray(giftLinks.familyId, [ids.hartleyId, ids.bloomId]));
      await db.delete(occasions).where(inArray(occasions.familyId, [ids.hartleyId, ids.bloomId]));
      await db.delete(appTokens).where(inArray(appTokens.accountId, [ids.samId, ids.joId, ids.blakeId]));
      await db.delete(appAuthCodes).where(inArray(appAuthCodes.accountId, [ids.samId, ids.joId, ids.blakeId]));
      await cleanupDemoFamilies(db, ids);
    }
    await client.end();
  });

  /** Sam (Hartley's owner) links a phone; returns the raw key. */
  async function link(opts: { accountId?: string; familyId?: string | null; childIds?: string[] | null; ua?: string; sync?: SyncChoices } = {}) {
    const code = await createAuthCode(db, { accountId: opts.accountId ?? ids.samId, familyId: opts.familyId === undefined ? ids.hartleyId : opts.familyId, childIds: opts.childIds ?? null, req: REQ, sync: opts.sync ?? NAMES });
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
      expect(Object.keys(me).sort()).toEqual(['children', 'family', 'sync']);
      expect(me.sync).toEqual(NAMES);
      expect(me.children.map((c) => c.id).sort()).toEqual([ids.oliviaId, ids.maxId].sort());
      for (const c of me.children) expect(Object.keys(c).every((k) => ['id', 'firstName', 'birthday'].includes(k))).toBe(true);
      expect(JSON.stringify(me)).not.toMatch(/@/); // no email of anyone
    });

    it('a code works once — a second swap fails', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ, sync: NAMES });
      expect((await swap(code)).ok).toBe(true);
      expect(await swap(code)).toEqual({ ok: false, status: 400, reason: 'invalid-grant' });
    });

    it('a wrong verifier fails, and burns the code (no second guess)', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ, sync: NAMES });
      expect(await swap(code, { codeVerifier: `${VERIFIER.slice(0, -1)}Q` })).toEqual({ ok: false, status: 400, reason: 'invalid-grant' });
      expect((await swap(code)).ok).toBe(false);
    });

    it('an expired code fails', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ, sync: NAMES }, new Date(Date.now() - 5 * 60_000));
      expect(await swap(code)).toEqual({ ok: false, status: 400, reason: 'invalid-grant' });
    });

    it('a different return address than the one the code was made for fails', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ, sync: NAMES });
      expect(await swap(code, { redirectUri: 'snickerdoodle-draw://auth/callback' })).toEqual({ ok: false, status: 400, reason: 'invalid-grant' });
    });

    it('the wrong app, grant type or a missing field is refused before anything is looked up', async () => {
      const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ, sync: NAMES });
      expect(await swap(code, { clientId: 'other' })).toEqual({ ok: false, status: 400, reason: 'invalid-request' });
      expect(await swap(code, { grantType: 'password' })).toEqual({ ok: false, status: 400, reason: 'invalid-request' });
      expect(await swap(code, { codeVerifier: undefined })).toEqual({ ok: false, status: 400, reason: 'invalid-request' });
      expect((await swap(code)).ok).toBe(true); // none of those burned it
    });

    it('only the family’s OWNER can link: a member is refused a code; "no family" swaps to 403 not-owner', async () => {
      await expect(createAuthCode(db, { accountId: ids.joId, familyId: ids.hartleyId, childIds: null, req: REQ, sync: NAMES })).rejects.toThrow();
      await expect(createAuthCode(db, { accountId: ids.samId, familyId: ids.bloomId, childIds: null, req: REQ, sync: NAMES })).rejects.toThrow(); // not Sam's family
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
      expect(res).toEqual({ assetId: expect.any(String), kept: true, created: true }); // never a moderation status
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

  // ── the sync choices (DRAW-APP-sync-choices.md) ─────────────────────────────────────────────────

  describe('sync choices: set at linking, changeable, audited', () => {
    const consentFor = (tokenId: string) =>
      db
        .select()
        .from(auditRecords)
        .where(and(eq(auditRecords.event, 'CONSENT_CHANGED'), eq(auditRecords.targetType, 'app_sync'), eq(auditRecords.targetId, tokenId)));

    it('a code for a family needs the grown-up’s choices — no default, no key without them', async () => {
      await expect(createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ })).rejects.toThrow(/choose/);
      await expect(createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: null, req: REQ, sync: { keepsakes: 'some' as never, children: false, progress: false, birthdays: false } })).rejects.toThrow(/choose/);
    });

    it('the choices made on the connect page land on the key, are logged as a consent change, and /me returns them', async () => {
      const token = await link({ sync: { keepsakes: 'proud', children: false, progress: true, birthdays: false } });
      const av = await viewerFor(token);
      expect(av.sync).toEqual({ keepsakes: 'proud', children: false, progress: true, birthdays: false });
      expect((await getAppMe(db, av)).sync).toEqual({ keepsakes: 'proud', children: false, progress: true, birthdays: false });
      const [row] = await db.select().from(appTokens).where(eq(appTokens.id, av.tokenId));
      expect(row!.syncChosenAt).not.toBeNull();
      const audit = await consentFor(av.tokenId);
      expect(audit).toHaveLength(1);
      expect(audit[0]!.metadata).toEqual({ by: 'connect', from: null, to: { keepsakes: 'proud', children: false, progress: true, birthdays: false } });
      expect(audit[0]!.actorAccountId).toBe(ids.samId);
    });

    it('PATCH /me/sync: any subset; returns the full object; a real change is audited, a no-op isn’t', async () => {
      const token = await link({ sync: EVERYTHING });
      const patch = async (body: Record<string, unknown>) => updateAppSync(db, await viewerFor(token), body);
      expect(await patch({ keepsakes: 'proud' })).toEqual({ ...EVERYTHING, keepsakes: 'proud' });
      expect(await patch({ progress: false, children: false })).toEqual({ keepsakes: 'proud', children: false, progress: false, birthdays: true });
      expect(await patch({ progress: false })).toEqual({ keepsakes: 'proud', children: false, progress: false, birthdays: true }); // nothing new
      expect(await patch({ keepsakes: 'none', birthdays: false })).toEqual(NOTHING);
      const audit = await consentFor((await viewerFor(token)).tokenId);
      expect(audit.map((a) => (a.metadata as { by: string }).by).sort()).toEqual(['app', 'app', 'app', 'connect']);
      expect((await viewerFor(await link({ sync: EVERYTHING }))).sync).toEqual(EVERYTHING); // another phone keeps its own
    });

    it('PATCH /me/sync may only narrow or stop: widening is website-only (403 widen-on-website), and changes nothing', async () => {
      const token = await link({ sync: { keepsakes: 'proud', children: false, progress: false, birthdays: false } });
      const patch = async (body: Record<string, unknown>) => updateAppSync(db, await viewerFor(token), body);
      await expectApiError(patch({ keepsakes: 'all' }), 403, 'widen-on-website');
      await expectApiError(patch({ children: true }), 403, 'widen-on-website');
      await expectApiError(patch({ progress: true }), 403, 'widen-on-website');
      await expectApiError(patch({ birthdays: true }), 403, 'widen-on-website');
      await expectApiError(patch({ keepsakes: 'none', birthdays: true }), 403, 'widen-on-website'); // one widening spoils the lot
      expect((await viewerFor(token)).sync).toEqual({ keepsakes: 'proud', children: false, progress: false, birthdays: false });
      expect(await patch({ keepsakes: 'proud', children: false })).toEqual({ keepsakes: 'proud', children: false, progress: false, birthdays: false }); // same is fine
      expect(await patch({ keepsakes: 'none' })).toEqual(NOTHING);
      await expectApiError(patch({ keepsakes: 'proud' }), 403, 'widen-on-website'); // none → proud is widening too
      // the website's account page can widen
      expect(await updateSyncFromWebsite(db, ids.samId, (await viewerFor(token)).tokenId, { keepsakes: 'all', children: true, progress: true, birthdays: true }, new Date())).toEqual({ ok: true, sync: EVERYTHING });
    });

    it('PATCH /me/sync validates every value', async () => {
      const av = await viewerFor(await link({ sync: NOTHING }));
      await expectApiError(updateAppSync(db, av, { keepsakes: 'everything' }), 422, 'invalid');
      await expectApiError(updateAppSync(db, av, { keepsakes: null }), 422, 'invalid');
      await expectApiError(updateAppSync(db, av, { children: 'yes' }), 422, 'invalid');
      await expectApiError(updateAppSync(db, av, { progress: 1 }), 422, 'invalid');
      expect(await updateAppSync(db, av, {})).toEqual(NOTHING);
    });

    it('the account page: only this account’s own, live phones; changes audited as "website"', async () => {
      const token = await link({ sync: NOTHING });
      const av = await viewerFor(token);
      expect(await updateSyncFromWebsite(db, ids.joId, av.tokenId, { keepsakes: 'all' }, new Date())).toEqual({ ok: false, reason: 'not-found' }); // Jo can't change Sam's phone
      expect(await updateSyncFromWebsite(db, ids.samId, av.tokenId, { keepsakes: 'nope' }, new Date())).toEqual({ ok: false, reason: 'invalid' });
      expect(await updateSyncFromWebsite(db, ids.samId, av.tokenId, { keepsakes: 'proud', children: true }, new Date())).toEqual({ ok: true, sync: { keepsakes: 'proud', children: true, progress: false, birthdays: false } });
      expect((await viewerFor(token)).sync).toEqual({ keepsakes: 'proud', children: true, progress: false, birthdays: false }); // the phone follows on its next call
      const listed = (await listLinkedDevices(db, ids.samId)).find((d) => d.id === av.tokenId)!;
      expect(listed).toMatchObject({ sync: { keepsakes: 'proud', children: true, progress: false, birthdays: false }, syncChosen: true });
      expect((await consentFor(av.tokenId)).some((a) => (a.metadata as { by: string }).by === 'website')).toBe(true);
      await revokeAppTokens(db, { tokenId: av.tokenId }, 'unlinked-on-website', { accountId: ids.samId, actorType: 'MEMBER' });
      expect(await updateSyncFromWebsite(db, ids.samId, av.tokenId, { keepsakes: 'all' }, new Date())).toEqual({ ok: false, reason: 'not-found' }); // disconnected: nothing to change
    });

    it('widening from the account page needs a sign-in in the last 15 minutes; narrowing never does (A-63)', async () => {
      const token = await link({ sync: { keepsakes: 'proud', children: false, progress: true, birthdays: false } });
      const { tokenId } = await viewerFor(token);
      const stale = new Date(Date.now() - 20 * 60_000);
      expect(await updateSyncFromWebsite(db, ids.samId, tokenId, { keepsakes: 'all' }, stale)).toEqual({ ok: false, reason: 'sign-in-again' });
      expect(await updateSyncFromWebsite(db, ids.samId, tokenId, { birthdays: true }, null)).toEqual({ ok: false, reason: 'sign-in-again' });
      expect(await updateSyncFromWebsite(db, ids.samId, tokenId, { keepsakes: 'none', birthdays: true }, stale)).toEqual({ ok: false, reason: 'sign-in-again' }); // one widening spoils the lot
      expect((await viewerFor(token)).sync).toEqual({ keepsakes: 'proud', children: false, progress: true, birthdays: false }); // nothing changed
      // narrowing and stopping never ask
      expect(await updateSyncFromWebsite(db, ids.samId, tokenId, { keepsakes: 'none', progress: false }, null)).toEqual({ ok: true, sync: NOTHING });
      // a fresh sign-in may widen
      expect(await updateSyncFromWebsite(db, ids.samId, tokenId, { keepsakes: 'all' }, new Date(Date.now() - 5 * 60_000))).toEqual({ ok: true, sync: { ...NOTHING, keepsakes: 'all' } });
    });

    it('a phone linked before the choices existed syncs nothing until a grown-up picks', async () => {
      const [old] = await db.insert(appTokens).values({ tokenHash: `legacy-${Date.now()}`, accountId: ids.samId, familyId: ids.hartleyId, deviceLabel: 'a phone or tablet' }).returning();
      const listed = (await listLinkedDevices(db, ids.samId)).find((d) => d.id === old!.id)!;
      expect(listed).toMatchObject({ sync: NOTHING, syncChosen: false });
      expect(await updateSyncFromWebsite(db, ids.samId, old!.id, { keepsakes: 'none' }, new Date())).toEqual({ ok: true, sync: NOTHING });
      expect((await listLinkedDevices(db, ids.samId)).find((d) => d.id === old!.id)!.syncChosen).toBe(true); // choosing "none" is still a choice
      expect((await consentFor(old!.id))[0]!.metadata).toMatchObject({ by: 'website', from: null });
    });
  });

  describe('sync off → 403 sync-off', () => {
    it('names and birthdays: off → no rename or birthday from the app, and /me shows first names only', async () => {
      const off = await viewerFor(await link({ sync: NOTHING }));
      await expectApiError(updateAppChild(db, off, ids.oliviaId, { firstName: 'Liv' }), 403, 'sync-off');
      await expectApiError(updateAppChild(db, off, ids.oliviaId, { birthday: '2020-01-01' }), 403, 'sync-off');
      await db.update(children).set({ birthday: '2020-06-01' }).where(eq(children.id, ids.oliviaId));
      const me = await getAppMe(db, off);
      expect(me.children.length).toBeGreaterThan(0);
      for (const c of me.children) expect(Object.keys(c).sort()).toEqual(['firstName', 'id']); // matching only
      const on = await viewerFor(await link({ sync: NAMES }));
      expect((await getAppMe(db, on)).children.find((c) => c.id === ids.oliviaId)).toMatchObject({ birthday: '2020-06-01' });
      expect(await updateAppChild(db, on, ids.oliviaId, { birthday: '2020-06-02' })).toMatchObject({ birthday: '2020-06-02' });
    });

    it('adding a little one still works with names off (a drawing needs someone to file under), but the birthday isn’t kept', async () => {
      const off = await viewerFor(await link({ sync: NOTHING }));
      const kid = await addAppChild(db, off, { firstName: 'Nell', birthday: '2022-02-02' });
      expect(kid).toEqual({ id: expect.any(String), firstName: 'Nell' });
      const [row] = await db.select().from(children).where(eq(children.id, kid.id));
      expect(row!.birthday).toBeNull();
    });

    it('drawing days: off → GET and PUT are refused, and nothing is stored', async () => {
      const off = await viewerFor(await link({ sync: NOTHING }));
      await expectApiError(putAppProgress(db, off, ids.maxId, { drawingDays: ['2026-11-01'] }), 403, 'sync-off');
      await expectApiError(getAppProgress(db, off, ids.maxId), 403, 'sync-off');
      expect(await db.select().from(appArtistProgress).where(eq(appArtistProgress.childId, ids.maxId))).toHaveLength(0);
    });

    it.skipIf(!S3)('keepsakes none → trigger:auto refused; manual (a grown-up’s one-off) still works', async () => {
      const off = await viewerFor(await link({ sync: NOTHING }));
      await expectApiError(keepAppDrawing(db, off, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen', trigger: 'auto' }, { env: ON, screening: queued().screening }), 403, 'sync-off');
      await expectApiError(keepAppDrawing(db, off, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen', trigger: 'sometimes' }, { env: ON }), 422, 'trigger');
      for (const trigger of ['manual', undefined]) {
        const res = await keepAppDrawing(db, off, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen', trigger }, { env: ON, screening: queued().screening });
        madeAssets.push(res.assetId);
        expect(res.kept).toBe(true);
      }
      // the uploads switch still comes first
      await expectApiError(keepAppDrawing(db, off, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen', trigger: 'auto' }, { env: {} }), 403, 'not-yet');
    });

    it.skipIf(!S3)('clientRef: a retry from the same family gets the same keepsake back (no duplicate); a bad ref is refused', async () => {
      const av = await viewerFor(await link({ sync: { keepsakes: 'all', children: false, progress: false, birthdays: false } }));
      const send = async (clientRef: unknown, viewer = av) =>
        keepAppDrawing(db, viewer, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen', trigger: 'auto', clientRef }, { env: ON, screening: queued().screening });
      const ref = `drw_${Date.now()}`;
      const first = await send(ref);
      madeAssets.push(first.assetId);
      expect(first).toEqual({ assetId: expect.any(String), kept: true, created: true });
      const again = await send(ref);
      expect(again).toEqual({ assetId: first.assetId, kept: true, created: false });
      // another phone of the same family retrying the same drawing: still the same keepsake
      const other = await viewerFor(await link({ sync: { keepsakes: 'all', children: false, progress: false, birthdays: false } }));
      expect((await send(ref, other)).assetId).toBe(first.assetId);
      expect(await db.select().from(assets).where(and(eq(assets.familyId, ids.hartleyId), eq(assets.appClientRef, ref)))).toHaveLength(1);
      // two copies of a retry at once: still exactly one keepsake
      const ref2 = `drw_race_${Date.now()}`;
      const [a, b] = await Promise.all([send(ref2), send(ref2)]);
      madeAssets.push(a.assetId, b.assetId);
      expect(a.assetId).toBe(b.assetId);
      expect(await db.select().from(assets).where(eq(assets.appClientRef, ref2))).toHaveLength(1);
      // no ref: a new keepsake every time, as before
      const n1 = await send(undefined);
      const n2 = await send(undefined);
      madeAssets.push(n1.assetId, n2.assetId);
      expect(n1.assetId).not.toBe(n2.assetId);
      for (const bad of ['has space', 'x'.repeat(65), '<script>', 42]) await expectApiError(send(bad), 422, 'clientRef');
    });

    it.skipIf(!S3)('clientRef is per family: another family using the same ref gets its own keepsake', async () => {
      const ref = `shared_${Date.now()}`;
      const sam = await viewerFor(await link({ sync: { keepsakes: 'all', children: false, progress: false, birthdays: false } }));
      const blake = await viewerFor(await link({ accountId: ids.blakeId, familyId: ids.bloomId, sync: { keepsakes: 'all', children: false, progress: false, birthdays: false } }));
      const [bloomKid] = await db.insert(children).values({ familyId: ids.bloomId, firstName: 'Wren', controllerAccountId: ids.blakeId }).returning();
      const s = await keepAppDrawing(db, sam, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-screen', clientRef: ref }, { env: ON, screening: queued().screening });
      const b = await keepAppDrawing(db, blake, { image: await blob(), childId: bloomKid!.id, madeOn: '2026-11-09', source: 'app-screen', clientRef: ref }, { env: ON, screening: queued().screening });
      madeAssets.push(s.assetId, b.assetId);
      expect(b.created).toBe(true);
      expect(b.assetId).not.toBe(s.assetId);
    });

    it.skipIf(!S3)('keepsakes proud / all → trigger:auto goes through the same ingest (FAMILY, held until checked)', async () => {
      for (const keepsakes of ['proud', 'all'] as const) {
        const av = await viewerFor(await link({ sync: { keepsakes, children: false, progress: false, birthdays: false } }));
        const res = await keepAppDrawing(db, av, { image: await blob(), childId: ids.maxId, madeOn: '2026-11-09', source: 'app-screen', trigger: 'auto' }, { env: ON, screening: queued().screening });
        madeAssets.push(res.assetId);
        const [row] = await db.select().from(assets).where(eq(assets.id, res.assetId));
        expect(row).toMatchObject({ visibility: 'FAMILY', keptInHome: true, moderationStatus: 'PENDING', controllerAccountId: ids.samId, source: 'app-screen' });
      }
    });

    it('turning a choice off bites on the very next call', async () => {
      const token = await link({ sync: { keepsakes: 'all', children: true, progress: true, birthdays: false } });
      await putAppProgress(db, await viewerFor(token), ids.oliviaId, { drawingDays: ['2026-11-02'] });
      await updateAppSync(db, await viewerFor(token), { progress: false, children: false });
      await expectApiError(getAppProgress(db, await viewerFor(token), ids.oliviaId), 403, 'sync-off');
      await expectApiError(updateAppChild(db, await viewerFor(token), ids.oliviaId, { firstName: 'Liv' }), 403, 'sync-off');
      // stopping never deletes what already synced
      expect(await db.select().from(appArtistProgress).where(eq(appArtistProgress.childId, ids.oliviaId))).toHaveLength(1);
    });
  });

  describe('drawing days backup (progress on)', () => {
    let av: AppViewer;
    beforeAll(async () => {
      av = await viewerFor(await link({ sync: { keepsakes: 'none', children: false, progress: true, birthdays: false } }));
      await db.delete(appArtistProgress).where(eq(appArtistProgress.familyId, ids.hartleyId));
    });

    it('nothing yet → 404 none; PUT then GET gives it back, trimmed to the five fields', async () => {
      await expectApiError(getAppProgress(db, av, ids.maxId), 404, 'none');
      await putAppProgress(db, av, ids.maxId, {
        drawingDays: ['2026-11-03', '2026-11-01', '2026-11-03'],
        restWeeks: ['2026-W44'],
        bestRun: 3,
        lessons: [{ id: 'circles-1', doneOn: '2026-11-01', extra: 'dropped' }],
        streaksOn: true,
        childName: 'not kept',
      });
      const back = await getAppProgress(db, av, ids.maxId);
      expect(back).toEqual({ drawingDays: ['2026-11-01', '2026-11-03'], restWeeks: ['2026-W44'], bestRun: 3, lessons: [{ id: 'circles-1', doneOn: '2026-11-01' }], streaksOn: true });
      await putAppProgress(db, av, ids.maxId, { drawingDays: ['2026-11-04'], restWeeks: [], bestRun: 1, lessons: [], streaksOn: false });
      expect((await getAppProgress(db, av, ids.maxId)).drawingDays).toEqual(['2026-11-04']); // replaced, one row per child
      expect(await db.select().from(appArtistProgress).where(eq(appArtistProgress.childId, ids.maxId))).toHaveLength(1);
    });

    it('a new phone (another link with drawing days on) picks it up', async () => {
      const fresh = await viewerFor(await link({ sync: { keepsakes: 'none', children: false, progress: true, birthdays: false } }));
      expect((await getAppProgress(db, fresh, ids.maxId)).drawingDays).toEqual(['2026-11-04']);
    });

    it('a bad backup is refused', async () => {
      await expectApiError(putAppProgress(db, av, ids.maxId, { drawingDays: ['yesterday'] }), 422, 'progress');
      await expectApiError(putAppProgress(db, av, ids.maxId, { drawingDays: ['2026-02-30'] }), 422, 'progress');
      await expectApiError(putAppProgress(db, av, ids.maxId, { restWeeks: ['2026-W60'] }), 422, 'progress');
      await expectApiError(putAppProgress(db, av, ids.maxId, { bestRun: -1 }), 422, 'progress');
      await expectApiError(putAppProgress(db, av, ids.maxId, { lessons: [{ id: '<script>', doneOn: '2026-11-01' }] }), 422, 'progress');
      await expectApiError(putAppProgress(db, av, ids.maxId, { streaksOn: 'yes' }), 422, 'progress');
      await expectApiError(putAppProgress(db, av, ids.maxId, { drawingDays: Array.from({ length: 6001 }, () => '2026-11-01') }), 422, 'progress');
    });

    it('only the key’s own family and ticked children: another family’s child, an unticked one, or junk → 404', async () => {
      const [bloomKid] = await db.insert(children).values({ familyId: ids.bloomId, firstName: 'Ivy', controllerAccountId: ids.blakeId }).returning();
      await expectApiError(putAppProgress(db, av, bloomKid!.id, { drawingDays: [] }), 404, 'not-found');
      await expectApiError(getAppProgress(db, av, bloomKid!.id), 404, 'not-found');
      await expectApiError(getAppProgress(db, av, 'not-a-uuid'), 404, 'not-found');
      const scoped = await viewerFor(await link({ childIds: [ids.oliviaId], sync: { keepsakes: 'none', children: false, progress: true, birthdays: false } }));
      await expectApiError(getAppProgress(db, scoped, ids.maxId), 404, 'not-found');
      // and Blake's own phone can't read Max's days either
      const blake = await viewerFor(await link({ accountId: ids.blakeId, familyId: ids.bloomId, sync: { keepsakes: 'none', children: false, progress: true, birthdays: false } }));
      await expectApiError(getAppProgress(db, blake, ids.maxId), 404, 'not-found');
    });

    it('the account page lists the backups of families this grown-up runs, and deletes them in one tap (audited)', async () => {
      expect((await listProgressBackups(db, [ids.hartleyId])).map((b) => b.childId)).toContain(ids.maxId);
      expect(await deleteProgressBackups(db, ids.joId, [ids.hartleyId])).toBe(0); // Jo doesn't run Hartley
      expect((await listProgressBackups(db, [ids.hartleyId])).length).toBeGreaterThan(0);
      expect(await deleteProgressBackups(db, ids.samId, [ids.hartleyId])).toBeGreaterThan(0);
      expect(await listProgressBackups(db, [ids.hartleyId])).toHaveLength(0);
      const audit = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'APP_PROGRESS_DELETED'), eq(auditRecords.familyId, ids.hartleyId)));
      expect(audit.some((a) => (a.metadata as { by: string }).by === 'website')).toBe(true);
    });

    it('retention: a backup no phone has refreshed for a year is deleted', async () => {
      await putAppProgress(db, av, ids.maxId, { drawingDays: ['2026-11-05'] }, new Date(Date.now() - 400 * 86_400_000));
      await putAppProgress(db, av, ids.oliviaId, { drawingDays: ['2026-11-05'] });
      await purgeAppLinkLeftovers(db);
      expect(await db.select().from(appArtistProgress).where(eq(appArtistProgress.childId, ids.maxId))).toHaveLength(0);
      expect(await db.select().from(appArtistProgress).where(eq(appArtistProgress.childId, ids.oliviaId))).toHaveLength(1);
    });

    it('disconnecting stops the backup at once (the key is gone)', async () => {
      const token = await link({ sync: { keepsakes: 'none', children: false, progress: true, birthdays: false } });
      const v = await viewerFor(token);
      await revokeAppTokens(db, { tokenId: v.tokenId }, 'unlinked-on-website', { accountId: ids.samId, actorType: 'MEMBER' });
      await expectLinkGone(viewerFor(token));
    });
  });

  // ── family birthdays & special days ↔ the family calendar (founder decisions 10 Nov, item 4) ─────

  describe('occasions: one list with the family calendar, only with "family birthdays" on', () => {
    const BDAYS: SyncChoices = { keepsakes: 'none', children: false, progress: false, birthdays: true };
    let av: AppViewer;
    beforeAll(async () => {
      av = await viewerFor(await link({ sync: BDAYS }));
    });

    it('off → every occasions call is 403 sync-off, and nothing is written', async () => {
      const off = await viewerFor(await link({ sync: NOTHING }));
      const before = (await db.select().from(occasions).where(eq(occasions.familyId, ids.hartleyId))).length;
      await expectApiError(listAppOccasions(db, off), 403, 'sync-off');
      await expectApiError(addAppOccasion(db, off, { name: 'Jo', kind: 'birthday', month: 11, day: 3 }), 403, 'sync-off');
      await expectApiError(updateAppOccasion(db, off, 'b4a3f7a0-0000-4000-8000-000000000000', { name: 'Jo' }), 403, 'sync-off');
      await expectApiError(deleteAppOccasion(db, off, 'b4a3f7a0-0000-4000-8000-000000000000'), 403, 'sync-off');
      expect((await db.select().from(occasions).where(eq(occasions.familyId, ids.hartleyId))).length).toBe(before);
    });

    it('POST from the app lands in the family calendar (someone else’s day, home only — D27; no year) and GET gives the app’s shape', async () => {
      const made = await addAppOccasion(db, av, { name: 'Jo', relation: 'Grandma', kind: 'birthday', month: 11, day: 3, year: 1956 });
      expect(made).toEqual({ id: expect.any(String), name: 'Jo', relation: 'Grandma', kind: 'birthday', month: 11, day: 3, updatedAt: expect.any(String) });
      const [row] = await db.select().from(occasions).where(eq(occasions.id, made.id));
      expect(row).toMatchObject({ familyId: ids.hartleyId, title: 'Jo', relation: 'Grandma', kind: 'BIRTHDAY', year: null, whose: 'SOMEONE_ELSE', shareCircle: 'HOME', createdByAccountId: ids.samId });
      // and the website's own calendar shows it
      expect((await occasionsFor(db, ids.samId, ids.hartleyId)).some((o) => o.id === made.id && o.date === '--11-03')).toBe(true);
      const list = await listAppOccasions(db, av);
      expect(list.find((o) => o.id === made.id)).toEqual(made);
      for (const o of list) expect(Object.keys(o).every((k) => ['id', 'name', 'relation', 'kind', 'month', 'day', 'updatedAt'].includes(k))).toBe(true);
    });

    it('a website date shows in the app as month/day only — the year never crosses; lunar dates and anniversaries map sensibly', async () => {
      const wedding = await addOccasion(db, ids.samId, ids.hartleyId, { title: 'granny and grandad', kind: 'ANNIVERSARY', date: '1980-06-21' });
      const lunar = await addOccasion(db, ids.samId, ids.hartleyId, { title: 'Nai Nai', kind: 'BIRTHDAY', date: '1950-02-10', lunar: 'CHINESE' });
      expect(wedding.ok && lunar.ok).toBe(true);
      const list = await listAppOccasions(db, av);
      const w = list.find((o) => wedding.ok && o.id === wedding.id)!;
      expect(w).toMatchObject({ name: 'granny and grandad', kind: 'other', month: 6, day: 21 });
      expect(JSON.stringify(list)).not.toMatch(/1980|1950|year/);
      expect(list.some((o) => lunar.ok && o.id === lunar.id)).toBe(false); // a lunar date moves each year: not sent as a fixed day
      // the app says 'other' on an anniversary: the website keeps calling it an anniversary
      await updateAppOccasion(db, av, w.id, { kind: 'other', day: 22 });
      const [row] = await db.select().from(occasions).where(eq(occasions.id, w.id));
      expect(row).toMatchObject({ kind: 'ANNIVERSARY', day: 22, year: 1980 }); // its year stays on the website
    });

    it('PATCH (any subset) and edits on the website both move updatedAt, so the last change wins', async () => {
      const made = await addAppOccasion(db, av, { name: 'Pat', kind: 'other', month: 1, day: 5 });
      await new Promise((r) => setTimeout(r, 15));
      const changed = await updateAppOccasion(db, av, made.id, { relation: 'uncle' });
      expect(changed).toMatchObject({ name: 'Pat', relation: 'uncle', kind: 'other', month: 1, day: 5 });
      expect(changed.updatedAt > made.updatedAt).toBe(true);
      await new Promise((r) => setTimeout(r, 15));
      expect((await updateOccasion(db, ids.samId, made.id, { title: 'Pat', kind: 'OTHER', date: '--01-06' })).ok).toBe(true);
      const after = (await listAppOccasions(db, av)).find((o) => o.id === made.id)!;
      expect(after).toMatchObject({ day: 6, relation: 'uncle' }); // a website edit keeps the relation
      expect(after.updatedAt > changed.updatedAt).toBe(true);
      expect(await updateAppOccasion(db, av, made.id, { relation: null })).not.toHaveProperty('relation');
    });

    it('names are first names, screened like the website’s; relation, kind and date are checked', async () => {
      await expectApiError(addAppOccasion(db, av, { name: 'Jo Bloggs', kind: 'birthday', month: 1, day: 1 }), 422, 'name');
      await expectApiError(addAppOccasion(db, av, { name: '', kind: 'birthday', month: 1, day: 1 }), 422, 'name');
      await expectApiError(addAppOccasion(db, av, { name: 'fuck', kind: 'birthday', month: 1, day: 1 }), 422, 'name');
      await expectApiError(addAppOccasion(db, av, { name: 'Jo', relation: 'shit uncle', kind: 'birthday', month: 1, day: 1 }), 422, 'relation');
      await expectApiError(addAppOccasion(db, av, { name: 'Jo', relation: '<b>', kind: 'birthday', month: 1, day: 1 }), 422, 'relation');
      await expectApiError(addAppOccasion(db, av, { name: 'Jo', kind: 'anniversary', month: 1, day: 1 }), 422, 'kind');
      await expectApiError(addAppOccasion(db, av, { name: 'Jo', kind: 'birthday', month: 2, day: 30 }), 422, 'date');
      await expectApiError(addAppOccasion(db, av, { name: 'Jo', kind: 'birthday', month: 13, day: 1 }), 422, 'date');
      await expectApiError(addAppOccasion(db, av, { name: 'Jo', kind: 'birthday', month: '11', day: 3 }), 422, 'date');
      expect(await addAppOccasion(db, av, { name: 'Leap', kind: 'birthday', month: 2, day: 29 })).toMatchObject({ month: 2, day: 29 });
    });

    it('only the linked family: another family’s date is out of reach (404), and DELETE removes it from the calendar too', async () => {
      const bloom = await addOccasion(db, ids.blakeId, ids.bloomId, { title: 'Ada', kind: 'BIRTHDAY', date: '--04-04' });
      expect(bloom.ok).toBe(true);
      const bloomId = bloom.ok ? bloom.id : '';
      expect((await listAppOccasions(db, av)).some((o) => o.id === bloomId)).toBe(false);
      await expectApiError(updateAppOccasion(db, av, bloomId, { name: 'Eve' }), 404, 'not-found');
      await expectApiError(deleteAppOccasion(db, av, bloomId), 404, 'not-found');
      await expectApiError(deleteAppOccasion(db, av, 'not-a-uuid'), 404, 'not-found');
      expect(await db.select().from(occasions).where(eq(occasions.id, bloomId))).toHaveLength(1);
      const mine = await addAppOccasion(db, av, { name: 'Bo', kind: 'other', month: 7, day: 7 });
      await deleteAppOccasion(db, av, mine.id);
      expect(await db.select().from(occasions).where(eq(occasions.id, mine.id))).toHaveLength(0);
    });

    it('a date for a child this phone isn’t for stays off the phone', async () => {
      const max = await addOccasion(db, ids.samId, ids.hartleyId, { title: 'first day at school', kind: 'MILESTONE', date: '2025-09-03', childId: ids.maxId });
      const scoped = await viewerFor(await link({ childIds: [ids.oliviaId], sync: BDAYS }));
      expect((await listAppOccasions(db, scoped)).some((o) => max.ok && o.id === max.id)).toBe(false);
      expect((await listAppOccasions(db, av)).some((o) => max.ok && o.id === max.id)).toBe(true);
    });

    it('every change from the app is in the audit trail (created / updated / deleted) — never the name or date', async () => {
      const made = await addAppOccasion(db, av, { name: 'Tam', relation: 'auntie', kind: 'birthday', month: 9, day: 9 });
      await updateAppOccasion(db, av, made.id, { day: 10, relation: 'aunt' });
      await deleteAppOccasion(db, av, made.id);
      const rows = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'OCCASION_CHANGED'), eq(auditRecords.targetId, made.id)));
      expect(rows.map((r) => (r.metadata as { action: string }).action).sort()).toEqual(['created', 'deleted', 'updated']);
      for (const r of rows) {
        expect(r).toMatchObject({ familyId: ids.hartleyId, actorAccountId: ids.samId, actorType: 'MEMBER', targetType: 'occasion' });
        expect(r.metadata).toMatchObject({ via: 'draw-app', appLink: av.tokenId });
        expect(JSON.stringify(r.metadata)).not.toMatch(/Tam|aunt/);
      }
      expect((rows.find((r) => (r.metadata as { action: string }).action === 'updated')!.metadata as { fields: string[] }).fields.sort()).toEqual(['day', 'relation']);
      // a refused change writes nothing
      const before = (await db.select().from(auditRecords).where(eq(auditRecords.event, 'OCCASION_CHANGED'))).length;
      await expectApiError(addAppOccasion(db, av, { name: 'Jo Bloggs', kind: 'birthday', month: 1, day: 1 }), 422, 'name');
      expect((await db.select().from(auditRecords).where(eq(auditRecords.event, 'OCCASION_CHANGED'))).length).toBe(before);
    });

    it('turning "family birthdays" off stops it and deletes nothing', async () => {
      const token = await link({ sync: BDAYS });
      const made = await addAppOccasion(db, await viewerFor(token), { name: 'Kit', kind: 'birthday', month: 8, day: 8 });
      await updateAppSync(db, await viewerFor(token), { birthdays: false });
      await expectApiError(listAppOccasions(db, await viewerFor(token)), 403, 'sync-off');
      expect(await db.select().from(occasions).where(eq(occasions.id, made.id))).toHaveLength(1);
    });
  });

  // ── "remove everything snickerdoodle draw sent" (A-48) ──────────────────────────────────────────

  describe.skipIf(!S3)('remove everything Draw sent', () => {
    it('deletes for good every keepsake the app sent in the families this grown-up runs — website uploads untouched, others can’t', async () => {
      const av = await viewerFor(await link({ sync: { keepsakes: 'all', children: false, progress: false, birthdays: false } }));
      const sent: string[] = [];
      for (let i = 0; i < 2; i++) {
        const r = await keepAppDrawing(db, av, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: i ? 'app-paper' : 'app-screen', trigger: 'auto' }, { env: ON, screening: queued().screening });
        sent.push(r.assetId);
        madeAssets.push(r.assetId);
      }
      const count = await countDrawSent(db, [ids.hartleyId]);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(await removeEverythingDrawSent(db, ids.joId, [ids.hartleyId])).toEqual({ removed: 0, kept: 0 }); // Jo doesn't run Hartley
      expect(await countDrawSent(db, [ids.hartleyId])).toBe(count);

      const res = await removeEverythingDrawSent(db, ids.samId, [ids.hartleyId]);
      expect(res.removed + res.kept).toBe(count);
      expect(res.kept).toBe(0);
      expect(await countDrawSent(db, [ids.hartleyId])).toBe(0);
      // the real cascading delete: rows, bytes, and an ASSET_DELETED audit each
      expect(await db.select().from(assets).where(inArray(assets.id, sent))).toHaveLength(0);
      expect(await db.select().from(storageObjects).where(inArray(storageObjects.assetId, sent))).toHaveLength(0);
      const audit = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'ASSET_DELETED'), inArray(auditRecords.targetId, sent)));
      expect(audit).toHaveLength(2);
      // the family's website keepsake is still there
      expect(await db.select().from(assets).where(eq(assets.id, ids.assetFamily))).toHaveLength(1);
    });
  });

  // ── content safety for app uploads (sign-off checklist G6) ──────────────────────────────────────

  describe.skipIf(!S3)('a held app upload can’t be ordered or gift-linked', () => {
    let av: AppViewer;
    beforeAll(async () => {
      av = await viewerFor(await link({ sync: { keepsakes: 'all', children: false, progress: false, birthdays: false } }));
    });
    afterAll(() => {
      screen.verdict = 'pass';
    });
    const keepOne = async () => {
      const res = await keepAppDrawing(db, av, { image: await blob(), childId: ids.oliviaId, madeOn: '2026-11-09', source: 'app-paper', trigger: 'auto' }, { env: ON, screening: queued().screening });
      madeAssets.push(res.assetId);
      return res.assetId;
    };
    const status = async (id: string) => (await db.select({ s: assets.moderationStatus }).from(assets).where(eq(assets.id, id)))[0]!.s;
    const orderIt = (assetId: string, accountId = ids.samId) =>
      placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }], account: { id: accountId }, joinProvenance: null });

    it('not checked yet (PENDING): the rest of the family can’t see it, and the app’s answer never says why', async () => {
      const id = await keepOne();
      expect(await status(id)).toBe('PENDING');
      const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
      const [row] = await db.select().from(assets).where(eq(assets.id, id));
      const { canViewAsset } = await import('@/authz');
      const { assetRefOf } = await import('@/server/assetRef');
      expect(canViewAsset(assetRefOf(row!), jo).allowed).toBe(false);
    });

    it('the checks can’t finish: it’s held for review — no ready-to-buy link, no order, never cleared by default', async () => {
      const id = await keepOne();
      screen.verdict = 'fail';
      await expectApiError(mintAppWish(db, av, { assetId: id, productKey: 'framedPrint' }), 409, 'not-ready');
      await expect(orderIt(id)).rejects.toThrow();
      expect(await status(id)).not.toBe('CLEAR');
    });

    it('flagged by the classifier: no ready-to-buy link, no order, and it lands in the review queue (never auto-rejected)', async () => {
      const id = await keepOne();
      screen.verdict = 'flag';
      await expectApiError(mintAppWish(db, av, { assetId: id, productKey: 'framedPrint' }), 409, 'not-ready'); // screened on the spot → FLAGGED
      expect(await status(id)).toBe('FLAGGED');
      await expect(orderIt(id)).rejects.toThrow(/cleared for printing/);
      const q = await reviewQueue(db, { accountId: ids.samId, isAdmin: true, mfaVerified: true });
      expect(q.items.find((i) => i.id === id)).toMatchObject({ kind: 'keepsake', source: 'upload' });
      expect((await db.select().from(assets).where(eq(assets.id, id))).length).toBe(1); // not binned
    });

    it('once the checks clear it, the same drawing can be shared (the gate is the check, not the app)', async () => {
      const id = await keepOne();
      screen.verdict = 'pass';
      // D27 (founder answer C): a share-sheet link can't know who opens it — extended-level drawings only
      await expectApiError(mintAppWish(db, av, { assetId: id, productKey: 'framedPrint' }), 409, 'family-only');
      await db.update(assets).set({ visibility: 'EXTENDED' }).where(eq(assets.id, id));
      const { url } = await mintAppWish(db, av, { assetId: id, productKey: 'framedPrint' });
      expect(url).toMatch(/\/g\//);
      expect(await status(id)).toBe('CLEAR');
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
