import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, auditRecords, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, type Reviewer } from '@/authz';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { decideReview, reviewImage, reviewQueue } from '@/server/admin/review';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/** Content review end to end: who may look, every look and decision audited, clear vs remove. */
describe.skipIf(!DB || !S3)('content review — the flagged queue (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let admin: Reviewer;
  const pic = () => sharp({ create: { width: 120, height: 80, channels: 3, background: { r: 200, g: 60, b: 40 } } }).png().toBuffer();

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    admin = { accountId: ids.samId, isAdmin: true, mfaVerified: true };
  });
  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function flagged(status: 'FLAGGED' | 'BLOCKED' = 'FLAGGED') {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await pic(), keptInHome: true });
    await db.update(assets).set({ moderationStatus: status, moderatedAt: new Date(), moderationDetail: { labels: ['Illustrated Explicit Nudity'], original: { status, labels: ['Illustrated Explicit Nudity'] } } }).where(eq(assets.id, a.assetId));
    return a.assetId;
  }
  const audits = (id: string, event: 'CONTENT_REVIEW_VIEWED' | 'CONTENT_REVIEWED') =>
    db.select().from(auditRecords).where(and(eq(auditRecords.targetId, id), eq(auditRecords.event, event)));

  it('the queue lists what was flagged, counts what was blocked, and is closed to everyone else', async () => {
    const f = await flagged();
    const b = await flagged('BLOCKED');
    const q = await reviewQueue(db, admin);
    expect(q.items.some((i) => i.id === f && i.labels.includes('Illustrated Explicit Nudity'))).toBe(true);
    expect(q.items.some((i) => i.id === b)).toBe(false); // never listed
    expect(q.blocked).toBeGreaterThanOrEqual(1);
    await expect(reviewQueue(db, { ...admin, mfaVerified: false })).rejects.toBeInstanceOf(AuthzError);
    await expect(reviewQueue(db, { ...admin, isAdmin: false })).rejects.toBeInstanceOf(AuthzError);
  });

  it('looking is recorded BEFORE the picture is handed over; blocked content is never handed over', async () => {
    const f = await flagged();
    const img = await reviewImage(db, admin, 'keepsake', f);
    expect(img.bytes.length).toBeGreaterThan(0);
    expect(await audits(f, 'CONTENT_REVIEW_VIEWED')).toHaveLength(1);
    const b = await flagged('BLOCKED');
    await expect(reviewImage(db, admin, 'keepsake', b)).rejects.toBeInstanceOf(AuthzError);
    expect(await audits(b, 'CONTENT_REVIEW_VIEWED')).toHaveLength(0);
  });

  it('"it’s fine" clears it for printing — and its stored verdicts too, so a re-screen can’t quietly re-flag it', async () => {
    const f = await flagged();
    await decideReview(db, admin, 'keepsake', f, 'clear');
    const [row] = await db.select().from(assets).where(eq(assets.id, f));
    expect(row!.moderationStatus).toBe('CLEAR');
    expect(row!.moderationDetail).toMatchObject({ original: { status: 'CLEAR' }, review: { decision: 'clear', by: ids.samId } });
    const [a] = await audits(f, 'CONTENT_REVIEWED');
    expect(a).toMatchObject({ actorType: 'ADMIN', metadata: { decision: 'clear' } });
  });

  it('"remove" erases it for real — picture, record and all — and says who did it', async () => {
    const f = await flagged();
    await decideReview(db, admin, 'keepsake', f, 'remove');
    expect(await db.select().from(assets).where(eq(assets.id, f))).toHaveLength(0);
    expect(await db.select().from(storageObjects).where(eq(storageObjects.assetId, f))).toHaveLength(0);
    const del = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, f), eq(auditRecords.event, 'ASSET_DELETED')));
    expect(del[0]).toMatchObject({ actorType: 'ADMIN', actorAccountId: ids.samId });
  });

  it('a picture that was never flagged is not the reviewer’s to look at or decide on', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const clean = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await pic(), keptInHome: true });
    await expect(reviewImage(db, admin, 'keepsake', clean.assetId)).rejects.toBeInstanceOf(AuthzError);
    await expect(decideReview(db, admin, 'keepsake', clean.assetId, 'remove')).rejects.toBeInstanceOf(AuthzError);
  });
});
