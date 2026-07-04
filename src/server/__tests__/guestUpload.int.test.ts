import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, mlOperations, orders, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { adoptEphemeralDraft, getViewableAssetOrThrow, resolveAssetViewer } from '@/server/assets';
import { ingestEphemeralUpload } from '@/server/ingest';
import { removeBackgroundForAsset } from '@/server/magic';
import { placeOrder } from '@/server/orders';
import { seedCatalogue } from '@/server/catalogue';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const png = () => sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .composite([{ input: { create: { width: 16, height: 16, channels: 3, background: { r: 40, g: 120, b: 200 } } }, left: 12, top: 12 }])
  .png()
  .toBuffer();

describe.skipIf(!DB || !S3)('guest ephemeral upload + claim authz (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const keys: string[] = [];
  const ephemeralIds: string[] = [];

  async function draft() {
    const r = await ingestEphemeralUpload(db, { buffer: await png(), kind: 'DRAWING', termsVersion: 'test-v1' });
    keys.push(r.key);
    ephemeralIds.push(r.assetId);
    return r;
  }

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });

  afterAll(async () => {
    if (ephemeralIds.length) {
      await db.delete(mlOperations).where(inArray(mlOperations.assetId, ephemeralIds));
      await db.delete(assets).where(inArray(assets.id, ephemeralIds)); // cascades storage_objects
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('ingests an ephemeral, claim-scoped, content-checked draft with no family/account', async () => {
    const r = await draft();
    expect(r.claimId).toBeTruthy();
    expect(r.moderationStatus).toBe('CLEAR');
    const [a] = await db.select().from(assets).where(eq(assets.id, r.assetId));
    expect(a!.familyId).toBeNull();
    expect(a!.uploaderAccountId).toBeNull();
    expect(a!.controllerAccountId).toBeNull();
    expect(a!.ephemeralClaimId).toBe(r.claimId);
    expect(a!.keptInHome).toBe(false);
    expect(a!.purgeAfter).not.toBeNull(); // retention-scheduled
    expect(a!.termsAcceptedAt).not.toBeNull(); // lawful basis recorded
    expect(a!.termsVersion).toBe('test-v1');
  });

  it('only the holder of the matching claim can view the draft', async () => {
    const r = await draft();
    const holder = await resolveAssetViewer(db, r.assetId, null, [r.claimId]);
    await expect(getViewableAssetOrThrow(db, r.assetId, holder)).resolves.toBeTruthy();

    const noClaim = await resolveAssetViewer(db, r.assetId, null, []);
    await expect(getViewableAssetOrThrow(db, r.assetId, noClaim)).rejects.toBeInstanceOf(AuthzError);

    const wrongClaim = await resolveAssetViewer(db, r.assetId, null, ['some-other-claim']);
    await expect(getViewableAssetOrThrow(db, r.assetId, wrongClaim)).rejects.toBeInstanceOf(AuthzError);

    // a signed-in member who does NOT hold the claim is also shut out
    const member = await resolveAssetViewer(db, r.assetId, ids.samId, []);
    await expect(getViewableAssetOrThrow(db, r.assetId, member)).rejects.toBeInstanceOf(AuthzError);
  });

  it('a guest can clean-edges their own draft (no account; per-creation budget)', async () => {
    const r = await draft();
    const holder = await resolveAssetViewer(db, r.assetId, null, [r.claimId]);
    const res = await removeBackgroundForAsset(db, holder, r.assetId);
    keys.push(res.key);
    const [obj] = await db.select().from(storageObjects).where(eq(storageObjects.id, res.objectId));
    expect(obj!.objectClass).toBe('DERIVATIVE');
    const ops = await db.select().from(mlOperations).where(eq(mlOperations.assetId, r.assetId));
    expect(ops).toHaveLength(1);
    expect(ops[0]!.accountId).toBeNull(); // a guest op — no account on the ledger row
  });

  it('an ephemeral draft cannot be ordered — it must be kept/adopted first', async () => {
    const r = await draft();
    // placeOrder resolves the viewer by family membership only (never a claim), so an
    // ephemeral draft is unviewable to the buyer and the order is refused.
    await expect(
      placeOrder(db, {
        items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: r.assetId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
        account: { id: ids.samId },
        joinProvenance: null,
      }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it('only the holder of the claim can adopt (keep) a draft', async () => {
    const r = await draft();
    await expect(adoptEphemeralDraft(db, ids.samId, ids.hartleyId, r.assetId, [])).rejects.toBeInstanceOf(AuthzError);
  });

  // Real S3 ingest + adopt + placeOrder — the default 5s starves under a full parallel
  // suite run (several print renders saturate the CPU in sibling workers).
  it('adoption turns the draft into a real, kept, orderable family asset', { timeout: 20_000 }, async () => {
    const r = await draft();
    await adoptEphemeralDraft(db, ids.samId, ids.hartleyId, r.assetId, [r.claimId]);

    const [a] = await db.select().from(assets).where(eq(assets.id, r.assetId));
    expect(a!.familyId).toBe(ids.hartleyId); // filed into the family
    expect(a!.controllerAccountId).toBe(ids.samId); // controller resolved
    expect(a!.ephemeralClaimId).toBeNull(); // claim retired (single-use)
    expect(a!.keptInHome).toBe(true);
    expect(a!.purgeAfter).toBeNull(); // off the retention clock

    // it was refused while ephemeral — now it orders
    const res = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: r.assetId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    expect(res.ok).toBe(true);
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    if (o) await db.delete(orders).where(eq(orders.id, o.id)); // cascades items + artwork
  });
});
