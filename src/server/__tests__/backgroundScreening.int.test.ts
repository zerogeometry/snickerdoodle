import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, orders, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { canViewAsset } from '@/authz';
import { resolveViewerContext } from '@/server/assets';
import { assetRefOf } from '@/server/assetRef';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { moderateAndRecord, screenPendingNow, screenStalePending, type ModerationProviders } from '@/server/moderation';
import type { BackgroundTask } from '@/server/background';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * Founder, 9 Nov 2026: the upload safety checks must never slow the catalogue down — they run in
 * the background and raise the flag when done, even mid-browse. These pin the safety around that:
 * PENDING can't be seen by the family or ordered unchecked, checkout finishes a pending check on the
 * spot, a report or Studio design made meanwhile is never wiped out, BLOCKED is never undone, and a
 * lost check is swept up. Real Postgres + MinIO; stub/fake providers only (no image leaves).
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const png = () => sharp({ create: { width: 1200, height: 1600, channels: 3, background: { r: 90, g: 160, b: 220 } } }).png().toBuffer();

const clean: ModerationProviders = { hash: null, classifier: { classify: async () => ({ flagged: false, labels: [], categories: [] }) }, textReader: { read: async () => [] } };
const nudity: ModerationProviders = { hash: null, classifier: { classify: async () => ({ flagged: true, labels: ['Exposed Male Genitalia'], categories: ['Explicit'] }) }, textReader: { read: async () => [] } };

describe.skipIf(!DB || !S3)('background screening (uploads checked after the catalogue loads)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const assetIds: string[] = [];
  const orderIds: string[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // the dev mark-paid fallback: no Stripe call
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (assetIds.length) for (const o of await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds))) await deleteObject(o.key).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  const sam = () => resolveViewerContext(db, ids.samId, ids.hartleyId);
  const jo = () => resolveViewerContext(db, ids.joId, ids.hartleyId);
  const row = async (id: string) => (await db.select().from(assets).where(eq(assets.id, id)))[0]!;

  /** Sam uploads in background mode; the queued check is handed back, not run. */
  async function pendingUpload() {
    const tasks: BackgroundTask[] = [];
    const ing = await ingestOriginalAsset(db, await sam(), { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true }, { background: (t) => tasks.push(t) });
    assetIds.push(ing.assetId);
    return { ...ing, tasks };
  }

  it('the upload returns at once as PENDING; the check runs after, then the flag lands', async () => {
    const { assetId, moderationStatus, tasks } = await pendingUpload();
    expect(moderationStatus).toBe('PENDING');
    expect((await row(assetId)).moderationStatus).toBe('PENDING');
    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    const r = await row(assetId);
    expect(r.moderationStatus).toBe('CLEAR');
    expect((r.moderationDetail as { original: unknown }).original).toMatchObject({ status: 'CLEAR' });
  });

  it('while PENDING, the family can’t see it; the uploading parent can; cleared → the family sees it', async () => {
    const { assetId, tasks } = await pendingUpload();
    expect(canViewAsset(assetRefOf(await row(assetId)), await sam()).allowed).toBe(true);
    expect(canViewAsset(assetRefOf(await row(assetId)), await jo()).allowed).toBe(false);
    await tasks[0]!();
    expect(canViewAsset(assetRefOf(await row(assetId)), await jo()).allowed).toBe(true);
  });

  it('a background check that FLAGS: held, never rejected, hidden from the family, remove-only (nudity, deferred)', async () => {
    const { assetId } = await pendingUpload();
    const tasks: BackgroundTask[] = [];
    const v = await moderateAndRecord(db, { assetId, familyId: ids.hartleyId, buffer: await png(), sha256: 'x' }, nudity, {}, { background: (t) => tasks.push(t) });
    expect(v.status).toBe('PENDING');
    await tasks[0]!();
    const r = await row(assetId);
    expect(r.moderationStatus).toBe('FLAGGED');
    expect((r.moderationDetail as { original: unknown }).original).toMatchObject({ status: 'FLAGGED', hashCheck: 'deferred', sensitive: true });
    expect(canViewAsset(assetRefOf(r), await jo()).allowed).toBe(false);
  });

  it('a report made while the check was running is never wiped out by a clean result', async () => {
    const { assetId } = await pendingUpload();
    const tasks: BackgroundTask[] = [];
    await moderateAndRecord(db, { assetId, familyId: ids.hartleyId, buffer: await png(), sha256: 'x' }, clean, {}, { background: (t) => tasks.push(t) });
    // the report lands first (as reportKeepsake writes it)
    await db.update(assets).set({ moderationStatus: 'FLAGGED', moderationDetail: { labels: ['reported by a family member'], reports: [{ reason: 'not-ok', at: new Date().toISOString(), via: 'family' }] } }).where(eq(assets.id, assetId));
    await tasks[0]!();
    const r = await row(assetId);
    expect(r.moderationStatus).toBe('FLAGGED');
    expect((r.moderationDetail as { reports: unknown[] }).reports).toHaveLength(1);
    expect((r.moderationDetail as { original: unknown }).original).toMatchObject({ status: 'CLEAR' });
  });

  it('a Studio design screened meanwhile still counts: a flagged design keeps it held', async () => {
    const { assetId } = await pendingUpload();
    await db.update(assets).set({ moderationDetail: { labels: ['Explicit'], design: { status: 'FLAGGED', labels: ['Explicit'], sensitive: true } } }).where(eq(assets.id, assetId));
    await screenPendingNow(db, [assetId], clean);
    const r = await row(assetId);
    expect(r.moderationStatus).toBe('FLAGGED');
    expect((r.moderationDetail as { design: unknown }).design).toMatchObject({ status: 'FLAGGED' });
  });

  it('BLOCKED is never undone by a later clean result', async () => {
    const { assetId, tasks } = await pendingUpload();
    await db.update(assets).set({ moderationStatus: 'BLOCKED' }).where(eq(assets.id, assetId));
    await tasks[0]!();
    expect((await row(assetId)).moderationStatus).toBe('BLOCKED');
  });

  it('screening on the spot reads the stored copy, decides PENDING ones, and leaves decided ones alone', async () => {
    const a = await pendingUpload();
    const b = await pendingUpload();
    await b.tasks[0]!(); // b is already CLEAR
    await screenPendingNow(db, [a.assetId, b.assetId], nudity);
    expect((await row(a.assetId)).moderationStatus).toBe('FLAGGED');
    expect((await row(b.assetId)).moderationStatus).toBe('CLEAR');
  });

  it('the sweep picks up a check that never finished (older than a minute), not one still running', async () => {
    const stale = await pendingUpload();
    const fresh = await pendingUpload();
    await db.update(assets).set({ createdAt: new Date(Date.now() - 5 * 60_000) }).where(eq(assets.id, stale.assetId));
    await screenStalePending(db, { providers: clean, limit: 500 });
    expect((await row(stale.assetId)).moderationStatus).toBe('CLEAR');
    expect((await row(fresh.assetId)).moderationStatus).toBe('PENDING');
  });

  it('checkout finishes a still-running check on the spot before it can order (never orders it unchecked)', async () => {
    const { assetId } = await pendingUpload();
    const res = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    const r = await row(assetId);
    expect(r.moderationStatus).toBe('CLEAR');
    expect((r.moderationDetail as { original?: unknown }).original).toMatchObject({ status: 'CLEAR' }); // screened, not skipped
  }, 60_000);
});
