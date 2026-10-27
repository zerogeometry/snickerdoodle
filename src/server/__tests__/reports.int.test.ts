import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, auditRecords, giftLinks } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, canViewAsset, type Reviewer, type ViewerContext } from '@/authz';
import { REPORTED_FROM_HOME_LABEL, REPORTED_LABEL, openReports } from '@/lib/reports';
import { assetRefOf, getViewableAssetOrThrow, listViewableAssets, resolveViewerContext } from '@/server/assets';
import { reportGiftLink, reportKeepsakeFromHome } from '@/server/contentReports';
import { clearDesignModeration, moderateAndRecord, moderateDesignAndRecord, type ModerationProviders } from '@/server/moderation';
import { decideReview, reviewQueue } from '@/server/admin/review';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/**
 * Reported ⇒ held for review (founder decision 2026-10-26): a reported keepsake is hidden from
 * relatives — only its uploader/controller sees it — until a reviewer decides. Reports come from a
 * gift link or the Keepsake Home; only the reviewer's CLEAR lets it be seen again.
 */
describe.skipIf(!DB)('reported keepsakes are held for review — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let admin: Reviewer;
  let sam: ViewerContext; // owner · controller of the seeded keepsakes
  let jo: ViewerContext; // Family circle · CONTRIBUTE
  let rosie: ViewerContext; // Extended circle · VIEW_BUY
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mailed = () => log.mock.calls.map((c) => String(c[0])).join('\n');
  const ENV = { SUPPORT_INBOX: 'team@example.test' };
  const clean: ModerationProviders = {
    hash: { isKnownIllegal: async () => false },
    classifier: { classify: async () => ({ flagged: false, labels: [] }) },
    textReader: { read: async () => [] },
  };

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    admin = { accountId: ids.samId, isAdmin: true, mfaVerified: true };
    sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
  });
  afterEach(() => log.mockClear());
  afterAll(async () => {
    if (ids) {
      await db.delete(giftLinks).where(eq(giftLinks.familyId, ids.hartleyId));
      await cleanupDemoFamilies(db, ids);
    }
    log.mockRestore();
    await client.end();
  });

  // every seeded Hartley keepsake starts kept + screened clean
  beforeEach(async () => {
    for (const id of [ids.assetFamily, ids.assetExtended, ids.assetOnlyMe, ids.assetJoFamily]) {
      await db
        .update(assets)
        .set({ keptInHome: true, moderationStatus: 'CLEAR', moderationDetail: { labels: [], original: { status: 'CLEAR', labels: [] } } })
        .where(eq(assets.id, id));
    }
  });

  async function link(assetIds: string[]) {
    const token = randomBytes(24).toString('base64url');
    await db.insert(giftLinks).values({
      familyId: ids.hartleyId,
      createdByAccountId: ids.samId,
      token,
      items: assetIds.map((assetId) => ({ assetId, productKey: 'framedPrint', label: 'framed print', unitPricePence: 6500 })),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
    return token;
  }
  const row = async (id: string) => (await db.select().from(assets).where(eq(assets.id, id)))[0]!;
  const seen = async (v: ViewerContext) => (await listViewableAssets(db, ids.hartleyId, v)).map((a) => a.id);
  const home = (v: ViewerContext, assetId: string, reason = 'inappropriate', extra: { note?: string; email?: string } = {}) =>
    reportKeepsakeFromHome(db, v, { assetId, reason, ...extra }, new Date(), ENV);

  it('a Home report holds it and hides it from every relative; the controller still sees it; the team is emailed, no picture', async () => {
    expect(await seen(rosie)).toContain(ids.assetExtended);
    expect(await seen(jo)).toContain(ids.assetExtended);

    expect(await home(rosie, ids.assetExtended, 'copyright', { note: 'that’s a cartoon character', email: 'Rosie@Example.test' })).toEqual({ ok: true });

    const a = await row(ids.assetExtended);
    expect(a.moderationStatus).toBe('FLAGGED'); // can't be printed or put on a gift link either
    expect(openReports(a.moderationDetail)).toHaveLength(1);
    expect(openReports(a.moderationDetail)[0]).toMatchObject({ reason: 'copyright', via: 'home' });
    expect(JSON.stringify(a.moderationDetail)).not.toMatch(/rosie|cartoon/i); // never the reporter or their note
    expect(assetRefOf(a).heldForReview).toBe(true);

    expect(await seen(rosie)).not.toContain(ids.assetExtended); // the reporter
    expect(await seen(jo)).not.toContain(ids.assetExtended); // every other relative
    await expect(getViewableAssetOrThrow(db, ids.assetExtended, jo)).rejects.toBeInstanceOf(AuthzError);
    expect(await seen(sam)).toContain(ids.assetExtended); // the controller: still there, marked "being checked"

    const q = await reviewQueue(db, admin);
    expect(q.items.find((i) => i.id === ids.assetExtended)).toMatchObject({ source: 'reported', labels: [REPORTED_FROM_HOME_LABEL, expect.stringMatching(/characters or logos/)] });

    const [audit] = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, ids.assetExtended), eq(auditRecords.event, 'CONTENT_FLAGGED')));
    expect(audit).toMatchObject({ actorType: 'MEMBER', actorAccountId: ids.rosieId, targetType: 'asset', metadata: { via: 'home report', reason: 'copyright', held: true } });

    const out = mailed();
    expect(out).toContain('[content-report] to team@example.test');
    expect(out).toContain('(reply to rosie@example.test)');
    expect(out).toContain('/admin/review');
    expect(out).not.toMatch(/https?:\/\/\S*\/(originals|derivatives)\//); // no picture, no signed URL
  });

  it('only what the member can see can be reported — others, ex-members and other families are refused', async () => {
    await expect(home(rosie, ids.assetFamily)).rejects.toBeInstanceOf(AuthzError); // FAMILY tier: not hers to see
    await expect(home(jo, ids.assetOnlyMe)).rejects.toBeInstanceOf(AuthzError); // only me
    const mallory = await resolveViewerContext(db, ids.malloryId, ids.hartleyId); // REMOVED
    await expect(home(mallory, ids.assetJoFamily)).rejects.toBeInstanceOf(AuthzError);
    const blake = await resolveViewerContext(db, ids.blakeId, ids.hartleyId); // another family
    await expect(home(blake, ids.assetJoFamily)).rejects.toBeInstanceOf(AuthzError);
    const anon: ViewerContext = { accountId: null, membership: null };
    await expect(home(anon, ids.assetJoFamily)).rejects.toBeInstanceOf(AuthzError);
    expect(await home(jo, ids.assetJoFamily, 'not-for-me')).toEqual({ ok: false, reason: 'invalid' }); // a gift-link reason
    expect(await home(jo, ids.assetJoFamily, 'made-up')).toEqual({ ok: false, reason: 'invalid' });
    for (const id of [ids.assetFamily, ids.assetOnlyMe, ids.assetJoFamily]) expect((await row(id)).moderationStatus).toBe('CLEAR');
  });

  it('a held keepsake can’t be reported by someone it’s hidden from, and isn’t held twice', async () => {
    expect(await home(jo, ids.assetExtended)).toEqual({ ok: true });
    await expect(home(rosie, ids.assetExtended)).rejects.toBeInstanceOf(AuthzError); // can't see ⇒ can't touch
    expect(await reportKeepsakeFromHome(db, sam, { assetId: ids.assetExtended, reason: 'other' }, new Date(), ENV)).toEqual({ ok: true });
    expect(openReports((await row(ids.assetExtended)).moderationDetail)).toHaveLength(1);
  });

  it('the reviewer’s CLEAR resolves the report and the family sees it again; a fresh report holds it again', async () => {
    await home(jo, ids.assetExtended);
    expect(await seen(rosie)).not.toContain(ids.assetExtended);

    await decideReview(db, admin, 'keepsake', ids.assetExtended, 'clear');
    const a = await row(ids.assetExtended);
    expect(a.moderationStatus).toBe('CLEAR');
    expect(openReports(a.moderationDetail)).toHaveLength(0);
    expect((a.moderationDetail as { reports: { resolvedAt?: string }[] }).reports[0]!.resolvedAt).toBeTruthy(); // kept, resolved
    expect(await seen(rosie)).toContain(ids.assetExtended);
    expect(await seen(jo)).toContain(ids.assetExtended);

    await home(rosie, ids.assetExtended, 'other');
    expect(await seen(jo)).not.toContain(ids.assetExtended);
    expect(openReports((await row(ids.assetExtended)).moderationDetail)).toHaveLength(1);
  });

  it('a Studio re-save, a dropped design or a re-screen can’t clear an open report — only a reviewer can', async () => {
    await home(jo, ids.assetFamily);
    await moderateDesignAndRecord(db, { assetId: ids.assetFamily, familyId: ids.hartleyId, buffer: Buffer.from('x') }, clean);
    let a = await row(ids.assetFamily);
    expect(a.moderationStatus).toBe('FLAGGED');
    expect(openReports(a.moderationDetail)).toHaveLength(1);
    expect(canViewAsset(assetRefOf(a), jo).allowed).toBe(false);

    await clearDesignModeration(db, ids.assetFamily);
    a = await row(ids.assetFamily);
    expect(a.moderationStatus).toBe('FLAGGED');
    expect(openReports(a.moderationDetail)).toHaveLength(1);

    await moderateAndRecord(db, { assetId: ids.assetFamily, familyId: ids.hartleyId, buffer: Buffer.from('x'), sha256: 'x' }, clean);
    a = await row(ids.assetFamily);
    expect(a.moderationStatus).toBe('FLAGGED');
    expect(canViewAsset(assetRefOf(a), jo).allowed).toBe(false);
    expect((await reviewQueue(db, admin)).items.find((i) => i.id === ids.assetFamily)?.labels).toContain(REPORTED_FROM_HOME_LABEL);

    await decideReview(db, admin, 'keepsake', ids.assetFamily, 'clear');
    expect(canViewAsset(assetRefOf(await row(ids.assetFamily)), jo).allowed).toBe(true);
  });

  it('a report on something the classifier already flagged hides it too, and review shows both', async () => {
    await db
      .update(assets)
      .set({ moderationStatus: 'FLAGGED', moderationDetail: { labels: ['Suggestive'], original: { status: 'FLAGGED', labels: ['Suggestive'] } } })
      .where(eq(assets.id, ids.assetJoFamily));
    expect(canViewAsset(assetRefOf(await row(ids.assetJoFamily)), sam).allowed).toBe(true); // flagged alone gates printing, not viewing
    await reportKeepsakeFromHome(db, sam, { assetId: ids.assetJoFamily, reason: 'inappropriate' }, new Date(), ENV);
    const a = await row(ids.assetJoFamily);
    expect(canViewAsset(assetRefOf(a), sam).allowed).toBe(false);
    expect(canViewAsset(assetRefOf(a), jo).allowed).toBe(true); // Jo uploaded it — she still sees it
    expect((await reviewQueue(db, admin)).items.find((i) => i.id === ids.assetJoFamily)).toMatchObject({ source: 'upload', labels: expect.arrayContaining([REPORTED_FROM_HOME_LABEL, 'Suggestive']) });
  });

  it('a gift-link report also holds and hides — from relatives, not from the controller — until CLEAR', async () => {
    const token = await link([ids.assetFamily, ids.assetExtended]);
    expect(await reportGiftLink(db, { token, reason: 'inappropriate' }, new Date(), ENV)).toEqual({ ok: true });
    for (const id of [ids.assetFamily, ids.assetExtended]) {
      const a = await row(id);
      expect(a.moderationStatus).toBe('FLAGGED');
      expect(assetRefOf(a).heldForReview).toBe(true);
      expect((a.moderationDetail as { labels: string[] }).labels[0]).toBe(REPORTED_LABEL);
    }
    expect(await seen(jo)).not.toContain(ids.assetFamily);
    expect(await seen(rosie)).not.toContain(ids.assetExtended);
    expect(await seen(sam)).toEqual(expect.arrayContaining([ids.assetFamily, ids.assetExtended]));
    expect((await reviewQueue(db, admin)).items.find((i) => i.id === ids.assetFamily)).toMatchObject({ source: 'reported', labels: expect.arrayContaining([REPORTED_LABEL]) });

    // a Studio re-save of a gift-link-reported keepsake can't release it either
    await moderateDesignAndRecord(db, { assetId: ids.assetFamily, familyId: ids.hartleyId, buffer: Buffer.from('x') }, clean);
    expect(await seen(jo)).not.toContain(ids.assetFamily);

    await decideReview(db, admin, 'keepsake', ids.assetFamily, 'clear');
    expect(await seen(jo)).toContain(ids.assetFamily);
    expect(await seen(rosie)).not.toContain(ids.assetExtended); // its own review is still to come
  });

  it('a CSAM-blocked keepsake is never touched by a report', async () => {
    await db.update(assets).set({ moderationStatus: 'BLOCKED', moderationDetail: { labels: ['csam-hash-match'] } }).where(eq(assets.id, ids.assetJoFamily));
    await expect(reportKeepsakeFromHome(db, sam, { assetId: ids.assetJoFamily, reason: 'inappropriate' }, new Date(), ENV)).rejects.toBeInstanceOf(AuthzError); // never even served
    const token = await link([ids.assetJoFamily]);
    expect(await reportGiftLink(db, { token, reason: 'inappropriate' }, new Date(), ENV)).toEqual({ ok: true });
    const a = await row(ids.assetJoFamily);
    expect(a.moderationStatus).toBe('BLOCKED');
    expect(a.moderationDetail).toEqual({ labels: ['csam-hash-match'] });
  });

  it('a report on a not-yet-screened keepsake keeps it PENDING (never reviewable past the hash check) and the screening keeps the hold', async () => {
    await db.update(assets).set({ moderationStatus: 'PENDING', moderationDetail: null }).where(eq(assets.id, ids.assetExtended));
    await home(rosie, ids.assetExtended);
    let a = await row(ids.assetExtended);
    expect(a.moderationStatus).toBe('PENDING');
    expect(await seen(rosie)).not.toContain(ids.assetExtended);
    expect((await reviewQueue(db, admin)).items.some((i) => i.id === ids.assetExtended)).toBe(false);

    await moderateAndRecord(db, { assetId: ids.assetExtended, familyId: ids.hartleyId, buffer: Buffer.from('x'), sha256: 'x' }, clean);
    a = await row(ids.assetExtended);
    expect(a.moderationStatus).toBe('FLAGGED'); // the screening was clean; the report still holds it
    expect(await seen(rosie)).not.toContain(ids.assetExtended);
    expect((await reviewQueue(db, admin)).items.find((i) => i.id === ids.assetExtended)?.source).toBe('reported');
  });
});
