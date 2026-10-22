import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { orderItemArtwork, orderItems, orders, savedDesigns, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { seedCatalogue } from '@/server/catalogue';
import { ingestOriginalAsset } from '@/server/ingest';
import { placeOrder } from '@/server/orders';
import { saveDesign } from '@/server/savedDesigns';
import { renderPrintFile } from '@/server/print/render';
import { patternGroundHex } from '@/lib/patterns';
import { deleteObject, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/** A drawing big enough to repeat well: a red blob on transparent (already lifted off its paper). */
const cutoutDrawing = () =>
  sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400"><circle cx="700" cy="700" r="420" fill="#c8402a"/></svg>')).png().toBuffer();

/**
 * Repeat-pattern BASE COLOUR end to end (founder, 22 Oct): the colour a parent picks is
 * normalised + frozen on the order line, saved with a design, and printed — the whole file on that
 * colour, each colour its own file.
 */
describe.skipIf(!DB || !S3)('pattern base colour — order → print file (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let assetId = '';
  const keys: string[] = [];
  const refs: string[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // dev "mark paid" path
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await cutoutDrawing(), keptInHome: true });
    keys.push(r.key);
    assetId = r.assetId;
  });

  afterAll(async () => {
    if (refs.length) await db.delete(orders).where(inArray(orders.ref, refs));
    if (assetId) {
      for (const o of await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))) await deleteObject(o.key).catch(() => {});
      await db.delete(savedDesigns).where(eq(savedDesigns.assetId, assetId)).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  it('each line freezes its own colour; junk and non-pattern products freeze none', async () => {
    const tf = { scale: 0 };
    const res = await placeOrder(db, {
      items: [
        { productKey: 'socks', qty: 1, artwork: { assetId, transform: tf, ground: 'navy' } },
        { productKey: 'socks-tube', qty: 1, artwork: { assetId, transform: tf, ground: 'tomato' } },
        { productKey: 'teaTowel', qty: 1, artwork: { assetId, transform: tf, ground: '#ff00ff' } }, // not a token → white
        { productKey: 'mug', qty: 1, artwork: { assetId, transform: tf, ground: 'navy' } }, // not a pattern product
      ],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    expect(res.ok).toBe(true);
    refs.push(res.ref!);
    const rows = await db
      .select({ sku: schema.productVariants.sku, ground: orderItemArtwork.ground })
      .from(orderItemArtwork)
      .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(schema.productVariants, eq(schema.productVariants.id, orderItemArtwork.variantId))
      .where(eq(orders.ref, res.ref!));
    const by = Object.fromEntries(rows.map((r) => [r.sku, r.ground]));
    expect(by).toMatchObject({ socks: 'navy', 'socks-tube': 'tomato', teaTowel: null });
    expect(Object.entries(by).find(([sku]) => sku.startsWith('mug'))?.[1]).toBeNull();
  });

  it('red and navy socks of one drawing print as two files, each on its own colour', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [socks] = await db.select({ id: schema.productVariants.id }).from(schema.productVariants).where(eq(schema.productVariants.sku, 'socks'));
    const corner = async (ground: string) => {
      const r = await renderPrintFile(db, sam, { assetId, variantId: socks!.id, transform: { scale: 0 }, ground });
      const [obj] = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.id, r.printObjectId));
      const { data } = await sharp(await getObjectBytes(obj!.key)).removeAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
      return { id: r.printObjectId, rgb: `#${[...data].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}` };
    };
    const navy = await corner('navy');
    const tomato = await corner('tomato');
    expect(navy.id).not.toBe(tomato.id); // two files — one never overwrites the other
    expect(navy.rgb).toBe(patternGroundHex('navy'));
    expect(tomato.rgb).toBe(patternGroundHex('tomato'));
  });

  it('the landscape tea towel prints as Prodigi’s PORTRAIT file (turned back), on its colour', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [towel] = await db.select({ id: schema.productVariants.id }).from(schema.productVariants).where(eq(schema.productVariants.sku, 'teaTowel'));
    const r = await renderPrintFile(db, sam, { assetId, variantId: towel!.id, transform: { scale: 0 }, ground: 'sky' });
    expect([r.widthPx, r.heightPx]).toEqual([5492, 8208]);
    const [obj] = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.id, r.printObjectId));
    const meta = await sharp(await getObjectBytes(obj!.key)).metadata();
    expect([meta.width, meta.height]).toEqual([5492, 8208]);
  }, 120_000);

  it('a saved design keeps its colour (pattern products only)', async () => {
    const account = { id: ids.samId, name: 'Sam' };
    const a = await saveDesign(db, account, [], { assetId, variantSku: 'socks', transform: { scale: 0 }, ground: 'sky' });
    const b = await saveDesign(db, account, [], { assetId, variantSku: 'mug', transform: { scale: 0 }, ground: 'sky' });
    expect(a.ok && b.ok).toBe(true);
    const rows = await db.select({ id: savedDesigns.id, ground: savedDesigns.ground }).from(savedDesigns).where(inArray(savedDesigns.id, [(a as { id: string }).id, (b as { id: string }).id]));
    const by = Object.fromEntries(rows.map((r) => [r.id, r.ground]));
    expect(by[(a as { id: string }).id]).toBe('sky');
    expect(by[(b as { id: string }).id]).toBeNull();
  });
});
