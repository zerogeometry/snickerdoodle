import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, auditRecords, giftLinks } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, type Reviewer } from '@/authz';
import { listViewableAssets, resolveViewerContext } from '@/server/assets';
import { getGiftLink } from '@/server/giftLinks';
import { reportAsMember, reportViaGiftLink } from '@/server/reports';
import { clearDesignModeration, moderateDesignAndRecord, type ModerationProviders } from '@/server/moderation';
import { decideReview, reviewQueue } from '@/server/admin/review';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/** One-tap report/takedown (D8): who can report, what a report holds back, and how it's resolved. */
describe.skipIf(!DB)('content reports — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let admin: Reviewer;

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    admin = { accountId: ids.samId, isAdmin: true, mfaVerified: true };
  });
  afterAll(async () => {
    await db.delete(giftLinks).where(eq(giftLinks.familyId, ids.hartleyId));
    if (ids) await cleanupDemoFamilies(db, ids);
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

  async function link(assetIds: string[], over: Partial<typeof giftLinks.$inferInsert> = {}) {
    const token = randomBytes(24).toString('base64url');
    await db.insert(giftLinks).values({
      familyId: ids.hartleyId,
      createdByAccountId: ids.samId,
      token,
      items: assetIds.map((assetId) => ({ assetId, productKey: 'framedPrint', label: 'framed print', unitPricePence: 6500 })),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      ...over,
    });
    return token;
  }
  const row = async (id: string) => (await db.select().from(assets).where(eq(assets.id, id)))[0]!;
  const reportAudits = (id: string) => db.select().from(auditRecords).where(and(eq(auditRecords.targetId, id), eq(auditRecords.event, 'CONTENT_REPORTED')));

  it('a gift-link holder (no account) reports an item → held for review, link stops serving it, audited with ids + reason only', async () => {
    const token = await link([ids.assetFamily]);
    expect((await getGiftLink(db, token)).state).toBe('active');

    expect(await reportViaGiftLink(db, token, ids.assetFamily, 'worrying', null)).toBe(true);

    const a = await row(ids.assetFamily);
    expect(a.moderationStatus).toBe('FLAGGED');
    expect((await getGiftLink(db, token)).state).toBe('gone'); // never sold or shown while held
    const audits = await reportAudits(ids.assetFamily);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorType).toBe('GUEST');
    expect(audits[0]!.metadata).toEqual({ reason: 'worrying', via: 'gift-link' });

    const q = await reviewQueue(db, admin);
    expect(q.items.find((i) => i.id === ids.assetFamily)).toMatchObject({ source: 'reported', labels: ['reported:worrying'] });
  });

  it('a token is never widened: revoked/expired links, items outside the snapshot, other families and ONLY_ME are refused', async () => {
    const live = await link([ids.assetFamily, ids.assetOnlyMe]);
    expect(await reportViaGiftLink(db, live, ids.assetExtended, 'other', null)).toBe(false); // not in the snapshot
    expect(await reportViaGiftLink(db, live, ids.assetBloomFamily, 'other', null)).toBe(false); // another family
    expect(await reportViaGiftLink(db, live, ids.assetOnlyMe, 'other', null)).toBe(false); // pulled back to only me
    const revoked = await link([ids.assetFamily], { status: 'REVOKED' });
    expect(await reportViaGiftLink(db, revoked, ids.assetFamily, 'other', null)).toBe(false);
    const expired = await link([ids.assetFamily], { expiresAt: new Date(Date.now() - 1000) });
    expect(await reportViaGiftLink(db, expired, ids.assetFamily, 'other', null)).toBe(false);
    expect(await reportViaGiftLink(db, 'no-such-token', ids.assetFamily, 'other', null)).toBe(false);

    for (const id of [ids.assetFamily, ids.assetExtended, ids.assetOnlyMe, ids.assetBloomFamily]) {
      expect((await row(id)).moderationStatus).not.toBe('FLAGGED');
    }
  });

  it('a family member reports what they can see; a member who can’t see it (or an ex-member) is refused', async () => {
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // Extended circle
    await reportAsMember(db, rosie, ids.assetExtended, 'someone-elses');
    expect((await row(ids.assetExtended)).moderationStatus).toBe('FLAGGED');

    await expect(reportAsMember(db, rosie, ids.assetFamily, 'worrying')).rejects.toBeInstanceOf(AuthzError); // FAMILY tier: not hers to see
    const mallory = await resolveViewerContext(db, ids.malloryId, ids.hartleyId); // REMOVED
    await expect(reportAsMember(db, mallory, ids.assetJoFamily, 'worrying')).rejects.toBeInstanceOf(AuthzError);
    const blake = await resolveViewerContext(db, ids.blakeId, ids.hartleyId); // other family
    await expect(reportAsMember(db, blake, ids.assetJoFamily, 'worrying')).rejects.toBeInstanceOf(AuthzError);
    expect((await row(ids.assetFamily)).moderationStatus).toBe('CLEAR');
    expect((await row(ids.assetJoFamily)).moderationStatus).toBe('CLEAR');
  });

  it('a CSAM-blocked item is never touched by a report', async () => {
    await db.update(assets).set({ moderationStatus: 'BLOCKED', moderationDetail: { labels: ['csam-hash-match'] } }).where(eq(assets.id, ids.assetJoFamily));
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await expect(reportAsMember(db, jo, ids.assetJoFamily, 'worrying')).rejects.toBeInstanceOf(AuthzError);
    const token = await link([ids.assetJoFamily]);
    await reportViaGiftLink(db, token, ids.assetJoFamily, 'worrying', null);
    const a = await row(ids.assetJoFamily);
    expect(a.moderationStatus).toBe('BLOCKED');
    expect(a.moderationDetail).toEqual({ labels: ['csam-hash-match'] });
  });

  it('re-saving a Studio design can’t quietly clear an open report — only a reviewer can', async () => {
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await reportAsMember(db, jo, ids.assetFamily, 'not-for-me');
    const clean: ModerationProviders = {
      hash: { isKnownIllegal: async () => false },
      classifier: { classify: async () => ({ flagged: false, labels: [] }) },
      textReader: { read: async () => [] },
    };
    await moderateDesignAndRecord(db, { assetId: ids.assetFamily, familyId: ids.hartleyId, buffer: Buffer.from('x') }, clean);
    expect((await row(ids.assetFamily)).moderationStatus).toBe('FLAGGED');
    await clearDesignModeration(db, ids.assetFamily);
    expect((await row(ids.assetFamily)).moderationStatus).toBe('FLAGGED');

    await decideReview(db, admin, 'keepsake', ids.assetFamily, 'clear');
    const a = await row(ids.assetFamily);
    expect(a.moderationStatus).toBe('CLEAR');
    expect((a.moderationDetail as { report: { status: string } }).report.status).toBe('CLEAR');
    // and a fresh report after the review holds it again
    await reportAsMember(db, jo, ids.assetFamily, 'worrying');
    expect((await row(ids.assetFamily)).moderationStatus).toBe('FLAGGED');
  });

  it('repeat reports don’t pile up without limit', async () => {
    const token = await link([ids.assetExtended]);
    const before = (await reportAudits(ids.assetExtended)).length;
    for (let i = 0; i < 25; i++) await reportViaGiftLink(db, token, ids.assetExtended, 'other', null);
    const a = await row(ids.assetExtended);
    expect((a.moderationDetail as { report: { reports: unknown[] } }).report.reports).toHaveLength(20);
    expect((await reportAudits(ids.assetExtended)).length - before).toBe(20);
  });

  it('while held it is hidden from relatives but still visible to its controller; clearing brings it back', async () => {
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId); // Family circle
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // Extended circle
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId); // controller
    const seen = async (v: typeof jo) => (await listViewableAssets(db, ids.hartleyId, v)).map((a) => a.id);
    expect(await seen(rosie)).toContain(ids.assetExtended);

    await reportAsMember(db, jo, ids.assetExtended, 'worrying');
    expect(await seen(rosie)).not.toContain(ids.assetExtended);
    expect(await seen(jo)).not.toContain(ids.assetExtended); // the reporter too
    expect(await seen(sam)).toContain(ids.assetExtended);
    await expect(reportAsMember(db, rosie, ids.assetExtended, 'other')).rejects.toBeInstanceOf(AuthzError); // can't see ⇒ can't touch

    await decideReview(db, admin, 'keepsake', ids.assetExtended, 'clear');
    expect(await seen(rosie)).toContain(ids.assetExtended);
  });

  it('a reviewer is emailed once when a keepsake first becomes held — with no family, child or picture details', async () => {
    const prev = process.env.REVIEW_ALERT_EMAILS;
    process.env.REVIEW_ALERT_EMAILS = 'reviewer@example.test';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const token = await link([ids.assetFamily]);
      await reportViaGiftLink(db, token, ids.assetFamily, 'someone-elses', null);
      await reportViaGiftLink(db, token, ids.assetFamily, 'worrying', null); // already held: no second alert
      const alerts = log.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('[review-alert]'));
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toContain('reviewer@example.test');
      expect(alerts[0]).toContain('/admin/review');
      expect(alerts[0]).not.toMatch(/hartley|olivia|max|0499|[0-9a-f]{8}-[0-9a-f]{4}/i);
    } finally {
      log.mockRestore();
      if (prev === undefined) delete process.env.REVIEW_ALERT_EMAILS;
      else process.env.REVIEW_ALERT_EMAILS = prev;
    }
  });
});
