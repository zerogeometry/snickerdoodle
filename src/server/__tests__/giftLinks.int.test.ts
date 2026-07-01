import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, giftLinks } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { resolveViewerContext } from '@/server/assets';
import { createGiftLink, getGiftLink, revokeGiftLink } from '@/server/giftLinks';
import { ingestOriginalAsset } from '@/server/ingest';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();

describe.skipIf(!DB || !S3)('gift links — integration', () => {
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
    await db.delete(giftLinks).where(eq(giftLinks.familyId, ids.hartleyId));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function keptAsset() {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keys.push(r.key);
    return r.assetId;
  }

  it('owner creates a link with a FROZEN snapshot; the recipient sees it active', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });

    const view = await getGiftLink(db, token);
    expect(view.state).toBe('active');
    if (view.state !== 'active') return;
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ assetId, productKey: 'framedPrint', unitPricePence: 6695 });
    expect(view.items[0]!.imageUrl).toMatch(/^http/); // a signed URL
  });

  it('a non-owner cannot create or revoke a link', async () => {
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // member, not owner
    const assetId = await keptAsset();
    await expect(createGiftLink(db, rosie, { familyId: ids.hartleyId, assetIds: [assetId] })).rejects.toBeInstanceOf(AuthzError);

    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { id } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });
    await expect(revokeGiftLink(db, rosie, id)).rejects.toBeInstanceOf(AuthzError);
  });

  it('a deleted source keepsake makes the link "gone" (never serves missing bytes)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });

    await db.delete(assets).where(eq(assets.id, assetId)); // parent removed the keepsake
    const view = await getGiftLink(db, token);
    expect(view.state).toBe('gone');
  });

  it('revoking turns the link off', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    const { id, token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });

    await revokeGiftLink(db, sam, id);
    const view = await getGiftLink(db, token);
    expect(view.state).toBe('revoked');
  });

  it('an expired link is no longer served', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    const { id, token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });

    await db.update(giftLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(giftLinks.id, id));
    const view = await getGiftLink(db, token);
    expect(view.state).toBe('expired');
  });

  it('a guest sees the gift list (no membership needed)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });
    // getGiftLink takes no viewer — it's intentionally accessible to anyone with the token
    const view = await getGiftLink(db, token);
    expect(view.state).toBe('active');
  });

  it('a BLOCKED (CSAM) keepsake can never be shared into a gift link (D8)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    await db.update(assets).set({ moderationStatus: 'BLOCKED' }).where(eq(assets.id, assetId));
    // the only chosen keepsake is blocked → nothing shareable
    await expect(createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] })).rejects.toBeInstanceOf(AuthzError);
  });

  it('a link whose source becomes uncleared serves "gone" — never an URL to BLOCKED bytes', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] }); // CLEAR at creation
    expect((await getGiftLink(db, token)).state).toBe('active');

    await db.update(assets).set({ moderationStatus: 'BLOCKED' }).where(eq(assets.id, assetId));
    const view = await getGiftLink(db, token);
    expect(view.state).toBe('gone'); // the token holder gets no bytes
  });
});
