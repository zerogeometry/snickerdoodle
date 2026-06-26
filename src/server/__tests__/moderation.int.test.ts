import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, auditRecords } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getViewableAssetOrThrow, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { moderateAndRecord } from '@/server/moderation';
import type { ModerationProviders } from '@/server/moderation';
import { purgeExpiredAssets } from '@/server/retention';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();

const flagging: ModerationProviders = {
  hash: { async isKnownIllegal() { return false; } },
  classifier: { async classify() { return { flagged: true, labels: ['Suggestive'] }; } },
};
const csam: ModerationProviders = {
  hash: { async isKnownIllegal() { return true; } },
  classifier: { async classify() { return { flagged: false, labels: [] }; } },
};

describe.skipIf(!DB || !S3)('content-safety gate — ingest → order/view/purge (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const keys: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('ingest runs the gate and (stub) clears a normal upload', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keys.push(asset.key);
    expect(asset.moderationStatus).toBe('CLEAR');
    const [row] = await db.select().from(assets).where(eq(assets.id, asset.assetId));
    expect(row!.moderationStatus).toBe('CLEAR');
    expect(row!.moderatedAt).not.toBeNull();
  });

  it('a classifier hit FLAGS for review (never auto-rejected) and is audited', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keys.push(asset.key);
    const v = await moderateAndRecord(db, { assetId: asset.assetId, familyId: ids.hartleyId, buffer: await png(), sha256: asset.sha256 }, flagging);
    expect(v.status).toBe('FLAGGED');
    const [row] = await db.select().from(assets).where(eq(assets.id, asset.assetId));
    expect(row!.moderationStatus).toBe('FLAGGED'); // still present — not binned
    const audited = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, asset.assetId), eq(auditRecords.event, 'CONTENT_FLAGGED')));
    expect(audited).toHaveLength(1);
  });

  it('a CSAM hash match is BLOCKED, audited, and never viewable by anyone — but not deleted', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keys.push(asset.key);
    await moderateAndRecord(db, { assetId: asset.assetId, familyId: ids.hartleyId, buffer: await png(), sha256: asset.sha256 }, csam);

    const [row] = await db.select().from(assets).where(eq(assets.id, asset.assetId));
    expect(row!.moderationStatus).toBe('BLOCKED');
    // even the controller cannot view / mint a URL / render blocked content
    await expect(getViewableAssetOrThrow(db, asset.assetId, sam)).rejects.toBeInstanceOf(AuthzError);
    const audited = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, asset.assetId), eq(auditRecords.event, 'CONTENT_BLOCKED')));
    expect(audited).toHaveLength(1);
  });

  it('the retention purge PRESERVES CSAM-blocked content (runbook), even when due', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: false });
    keys.push(asset.key);
    await db
      .update(assets)
      .set({ moderationStatus: 'BLOCKED', purgeAfter: new Date(Date.now() - 86_400_000) })
      .where(eq(assets.id, asset.assetId));

    const summary = await purgeExpiredAssets(db, { now: new Date() });
    expect(summary.purgedAssetIds).not.toContain(asset.assetId);
    const [row] = await db.select().from(assets).where(eq(assets.id, asset.assetId));
    expect(row).toBeTruthy(); // preserved, not purged
  });
});
