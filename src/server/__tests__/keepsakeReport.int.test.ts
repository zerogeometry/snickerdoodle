import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, auditRecords } from '@/db/schema';
import { AuthzError } from '@/authz';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { getViewableAssetOrThrow, resolveViewerContext } from '@/server/assets';
import { reportKeepsake } from '@/server/contentReports';
import { clearDesignModeration, moderateDesignAndRecord, type ModerationProviders } from '@/server/moderation';
import { decideReview } from '@/server/admin/review';
import { isHeldForReport } from '@/server/assetRef';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const clean: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: false, labels: [] }) }, textReader: { read: async () => [] } };
const SILENT = { SUPPORT_INBOX: 'review@example.test' };

/**
 * Report a keepsake from inside the family (D8; gap audit, 27 Oct): held straight away — never
 * printed, hidden from relatives, visible to its parent — until a reviewer clears or removes it.
 */
describe.skipIf(!DB)('reporting a keepsake from inside the family', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await db.update(assets).set({ moderationStatus: 'CLEAR', moderationDetail: { labels: [] } }).where(eq(assets.familyId, ids.hartleyId));
  });
  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const row = async (id: string) => (await db.select().from(assets).where(eq(assets.id, id)))[0]!;
  const reports = async (id: string) => (await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, id), eq(auditRecords.event, 'CONTENT_FLAGGED')))).length;

  it('a relative reports a keepsake they can see: held, hidden from relatives, still the parent’s — and audited once', async () => {
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId); // FAMILY circle, not its controller
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId); // its controlling parent
    await getViewableAssetOrThrow(db, ids.assetFamily, jo); // visible before

    expect(await reportKeepsake(db, jo, { assetId: ids.assetFamily, reason: 'inappropriate', note: 'not ok' }, new Date(), SILENT)).toEqual({ ok: true });
    const r = await row(ids.assetFamily);
    expect(r.moderationStatus).toBe('FLAGGED'); // never printed while held
    expect(isHeldForReport(r)).toBe(true);
    await expect(getViewableAssetOrThrow(db, ids.assetFamily, jo)).rejects.toBeInstanceOf(AuthzError); // hidden from relatives
    await expect(getViewableAssetOrThrow(db, ids.assetFamily, await resolveViewerContext(db, ids.rosieId, ids.hartleyId))).rejects.toBeInstanceOf(AuthzError);
    await getViewableAssetOrThrow(db, ids.assetFamily, sam); // …the parent still sees it
    expect(await reports(ids.assetFamily)).toBe(1);

    // a second report changes nothing (no repeat flag, no repeat email)
    expect(await reportKeepsake(db, jo, { assetId: ids.assetFamily, reason: 'other' }, new Date(), SILENT)).toEqual({ ok: true });
    expect(await reports(ids.assetFamily)).toBe(1);
  });

  it('a Studio re-save (or a dropped design) can’t quietly clear an open report', async () => {
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } }).png().toBuffer();
    await moderateDesignAndRecord(db, { assetId: ids.assetFamily, familyId: ids.hartleyId, buffer: png }, clean);
    expect(isHeldForReport(await row(ids.assetFamily))).toBe(true);
    await clearDesignModeration(db, ids.assetFamily);
    expect(isHeldForReport(await row(ids.assetFamily))).toBe(true);
  });

  it('a reviewer’s clear resolves it: visible to the family again, and a later re-screen can’t revive the report', async () => {
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await decideReview(db, { accountId: ids.samId, isAdmin: true, mfaVerified: true }, 'keepsake', ids.assetFamily, 'clear');
    const r = await row(ids.assetFamily);
    expect(r.moderationStatus).toBe('CLEAR');
    expect(isHeldForReport(r)).toBe(false);
    expect((r.moderationDetail as { resolvedReports?: unknown[] }).resolvedReports?.length).toBe(1);
    await getViewableAssetOrThrow(db, ids.assetFamily, jo);
  });

  it('only someone who can see it and doesn’t manage it may report; a blocked one is never touched', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // EXTENDED: can't see FAMILY keepsakes
    const blake = await resolveViewerContext(db, ids.blakeId, ids.bloomId); // another family
    expect((await reportKeepsake(db, sam, { assetId: ids.assetExtended, reason: 'other' }, new Date(), SILENT)).ok).toBe(false); // its own parent
    expect((await reportKeepsake(db, rosie, { assetId: ids.assetJoFamily, reason: 'other' }, new Date(), SILENT)).ok).toBe(false);
    expect((await reportKeepsake(db, blake, { assetId: ids.assetExtended, reason: 'other' }, new Date(), SILENT)).ok).toBe(false);
    expect((await reportKeepsake(db, rosie, { assetId: ids.assetExtended, reason: 'not-for-me' }, new Date(), SILENT)).ok).toBe(false); // not a keepsake reason
    expect((await row(ids.assetExtended)).moderationStatus).toBe('CLEAR');

    await db.update(assets).set({ moderationStatus: 'BLOCKED' }).where(eq(assets.id, ids.assetJoFamily));
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    // (Jo controls that one; Sam is in the FAMILY circle and can see it)
    expect(await reportKeepsake(db, sam, { assetId: ids.assetJoFamily, reason: 'inappropriate' }, new Date(), SILENT)).toEqual({ ok: true });
    expect((await row(ids.assetJoFamily)).moderationStatus).toBe('BLOCKED');
    expect(jo.accountId).toBe(ids.joId);
  });
});
