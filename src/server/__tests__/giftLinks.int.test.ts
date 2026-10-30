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
import { GIFT_LINK_TTL_DAYS, GIFT_PREVIEW_MAX_PX, createGiftLink, getGiftLink, giftLinkPreview, giftPreviewPath, revokeGiftLink } from '@/server/giftLinks';
import { ingestOriginalAsset } from '@/server/ingest';
import { deleteObject } from '@/storage';
import { persistDerivative } from '@/server/print/compositor';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

const png = (size = 8) => sharp({ create: { width: size, height: size, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();

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

  async function keptAsset(size = 8) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(size), keptInHome: true });
    keys.push(r.key);
    return r.assetId;
  }

  it('owner creates a link with a FROZEN snapshot; the recipient sees it active', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    const before = Date.now();
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });
    // a gift link works for 14 days (founder, 2026-10-21), not a month
    const [row] = await db.select({ expiresAt: schema.giftLinks.expiresAt }).from(schema.giftLinks).where(eq(schema.giftLinks.token, token));
    expect(GIFT_LINK_TTL_DAYS).toBe(14);
    expect(Math.abs(row!.expiresAt.getTime() - (before + 14 * 86_400_000))).toBeLessThan(60_000);

    const view = await getGiftLink(db, token);
    expect(view.state).toBe('active');
    if (view.state !== 'active') return;
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ assetId, productKey: 'framedPrint', unitPricePence: 6500 });
    // the holder gets the link's own preview route — never a signed URL to the original
    // (with a product mockup frozen at sharing time the path names the product: ?p=<key> — 06-B8)
    expect(view.items[0]!.imageUrl?.startsWith(giftPreviewPath(token, assetId))).toBe(true);
    expect(view.items[0]!.imageUrl).not.toMatch(/^http/);
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

  it('the preview is small + re-encoded, never the original', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset(2000);
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });
    const img = await giftLinkPreview(db, token, assetId);
    expect(img).not.toBeNull();
    const meta = await sharp(img!).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(GIFT_PREVIEW_MAX_PX);
    expect(meta.exif).toBeUndefined();
  });

  // 06-B8 (sweep 29 Oct): the gift list showed the bare drawing, never the product as designed.
  it('06-B8: the preview is the product as the parent shared it (a frozen mockup of THIS keepsake), else the drawing', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset(64);
    const other = await keptAsset(64);
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });
    // start from "no mockup frozen" whatever this machine's mockup templates are (some envs compose one at sharing)
    const [fresh] = await db.select().from(giftLinks).where(eq(giftLinks.token, token));
    await db.update(giftLinks).set({ items: (fresh!.items as object[]).map((i) => ({ ...i, mockupObjectId: null })) }).where(eq(giftLinks.id, fresh!.id));
    const colourOf = async (img: Buffer | null) => (await sharp(img!).stats()).channels.slice(0, 3).map((c) => Math.round(c.mean));
    expect(await colourOf(await giftLinkPreview(db, token, assetId))).toEqual([9, 9, 9]); // no mockup frozen → the drawing

    // a mockup of this keepsake (a DERIVATIVE of it), frozen into the item: that's what's served
    const mug = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 200, g: 40, b: 40 } } }).webp().toBuffer();
    const mockKey = `test/gift-mockup-${ids.nonce}.webp`;
    keys.push(mockKey);
    const mockupObjectId = await persistDerivative(db, assetId, mockKey, mug);
    const [link] = await db.select().from(giftLinks).where(eq(giftLinks.token, token));
    const items = (link!.items as { assetId: string; productKey: string }[]).map((i) => ({ ...i, mockupObjectId }));
    await db.update(giftLinks).set({ items }).where(eq(giftLinks.id, link!.id));
    const [r = 0, g = 0, b = 0] = await colourOf(await giftLinkPreview(db, token, assetId, items[0]!.productKey));
    expect(r).toBeGreaterThan(150);
    expect(g + b).toBeLessThan(120);
    const view = await getGiftLink(db, token);
    if (view.state === 'active') expect(view.items[0]!.imageUrl).toBe(giftPreviewPath(token, assetId, items[0]!.productKey));

    // never another keepsake's picture, even if a link's item pointed at one: the drawing instead
    const otherObj = await persistDerivative(db, other, `test/gift-other-${ids.nonce}.webp`, mug);
    keys.push(`test/gift-other-${ids.nonce}.webp`);
    await db.update(giftLinks).set({ items: items.map((i) => ({ ...i, mockupObjectId: otherObj })) }).where(eq(giftLinks.id, link!.id));
    expect(await colourOf(await giftLinkPreview(db, token, assetId))).toEqual([9, 9, 9]);
  });

  it('no preview for an asset outside the snapshot, a revoked link, or an unknown token', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const inLink = await keptAsset();
    const other = await keptAsset();
    const { id, token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [inLink] });
    expect(await giftLinkPreview(db, token, other)).toBeNull(); // the token is never widened
    expect(await giftLinkPreview(db, 'no-such-token', inLink)).toBeNull();
    await revokeGiftLink(db, sam, id);
    expect(await giftLinkPreview(db, token, inLink)).toBeNull();
  });

  it('a keepsake pulled back to ONLY_ME drops off the list and serves no preview', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const kept = await keptAsset();
    const hidden = await keptAsset();
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [kept, hidden] });
    await db.update(assets).set({ visibility: 'ONLY_ME' }).where(eq(assets.id, hidden));

    const view = await getGiftLink(db, token);
    expect(view.state).toBe('active');
    if (view.state !== 'active') return;
    expect(view.items.map((i) => i.assetId)).toEqual([kept]);
    expect(await giftLinkPreview(db, token, hidden)).toBeNull();

    // and if every item is pulled back, the link has nothing left to show
    await db.update(assets).set({ visibility: 'ONLY_ME' }).where(eq(assets.id, kept));
    expect((await getGiftLink(db, token)).state).toBe('gone');
  });
});
