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
import { CARD_PANEL_X, CARD_SPREAD } from '@/server/print/cardPrint';
import { groundHex } from '@/lib/patterns';
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
        { productKey: 'socks', qty: 1, artwork: { assetId, transform: tf, ground: 'navy' } }, // a pre-wheel word → its colour
        { productKey: 'socks-tube', qty: 1, artwork: { assetId, transform: tf, ground: '#0B6623' } },
        { productKey: 'teaTowel', qty: 1, artwork: { assetId, transform: tf, ground: 'not-a-colour' } }, // junk → white
        { productKey: 'phoneCase', qty: 1, artwork: { assetId, transform: tf, ground: '#c8402a' } }, // edge to edge: kept
        { productKey: 'kidsTee', qty: 1, artwork: { assetId, transform: tf, ground: '#c8402a' } }, // a garment prints on its own colour: none
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
    expect(by).toMatchObject({ socks: '#26334f', 'socks-tube': '#0b6623', teaTowel: null });
    expect(Object.entries(by).find(([sku]) => sku.startsWith('phoneCase'))?.[1]).toBe('#c8402a');
    expect(Object.entries(by).find(([sku]) => sku.startsWith('kidsTee'))?.[1]).toBeNull();
  });

  it('red and navy socks of one drawing print as two files, each on its own colour', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [socks] = await db.select({ id: schema.productVariants.id }).from(schema.productVariants).where(eq(schema.productVariants.sku, 'socks'));
    const corner = async (ground: string) => {
      const r = await renderPrintFile(db, sam, { assetId, variantId: socks!.id, transform: { scale: 0 }, ground });
      const [obj] = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.id, r.printObjectId));
      // the base colour = the most common colour on a grid of points (the motifs cover far less of
      // the sheet than the gaps — and a motif may wrap across any single spot, e.g. the corner)
      const { data, info } = await sharp(await getObjectBytes(obj!.key)).removeAlpha().resize(40, 40, { kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
      const counts = new Map<string, number>();
      for (let i = 0; i < info.width * info.height; i++) {
        const hex = `#${[data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
      const rgb = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      return { id: r.printObjectId, rgb };
    };
    const navy = await corner('#26334f');
    const green = await corner('#0b6623');
    expect(navy.id).not.toBe(green.id); // two files — one never overwrites the other
    expect(navy.rgb.toLowerCase()).toBe(groundHex('#26334f'));
    expect(green.rgb.toLowerCase()).toBe(groundHex('#0b6623'));
  });

  it('the landscape tea towel prints as Prodigi’s PORTRAIT file (turned back), on its colour', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [towel] = await db.select({ id: schema.productVariants.id }).from(schema.productVariants).where(eq(schema.productVariants.sku, 'teaTowel'));
    const r = await renderPrintFile(db, sam, { assetId, variantId: towel!.id, transform: { scale: 0 }, ground: '#8fb5d6' });
    expect([r.widthPx, r.heightPx]).toEqual([5492, 8208]);
    const [obj] = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.id, r.printObjectId));
    const meta = await sharp(await getObjectBytes(obj!.key)).metadata();
    expect([meta.width, meta.height]).toEqual([5492, 8208]);
  }, 120_000);

  it('a PLACED drawing on an edge-to-edge product prints on its colour — the whole face, its own file', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [cushion] = await db.select({ id: schema.productVariants.id, sku: schema.productVariants.sku }).from(schema.productVariants).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).where(eq(schema.products.key, 'cushion'));
    const fileOf = async (ground?: string) => {
      const r = await renderPrintFile(db, sam, { assetId, variantId: cushion!.id, transform: { scale: 0.5 }, ground });
      const [obj] = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.id, r.printObjectId));
      return { id: r.printObjectId, key: obj!.key, buf: await getObjectBytes(obj!.key) };
    };
    const white = await fileOf();
    const green = await fileOf('#0b6623');
    expect(green.id).not.toBe(white.id);
    expect(green.key).toContain('-g0b6623');
    const px = async (buf: Buffer, x: number, y: number) => {
      const { data } = await sharp(buf).removeAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
      return `#${[...data].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    };
    // the corner (outside the half-size drawing) is the colour; on white it stays white
    expect(await px(green.buf, 2, 2)).toBe('#0b6623');
    expect(await px(white.buf, 2, 2)).toBe('#ffffff');
  }, 120_000);

  it('a GREETINGS CARD prints its colour on the outside front only — the inside stays white, its own file', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [card] = await db.select({ id: schema.productVariants.id }).from(schema.productVariants).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).where(eq(schema.products.key, 'card'));
    const fileOf = async (ground?: string) => {
      const r = await renderPrintFile(db, sam, { assetId, variantId: card!.id, transform: { scale: 0 }, ground });
      const [obj] = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.id, r.printObjectId));
      return { id: r.printObjectId, key: obj!.key, buf: await getObjectBytes(obj!.key) };
    };
    const px = async (buf: Buffer, x: number, y: number) => {
      const { data } = await sharp(buf).removeAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
      return `#${[...data].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    };
    const white = await fileOf();
    const sky = await fileOf('#8FB5D6');
    expect(sky.id).not.toBe(white.id); // two colours never overwrite each other's file
    expect(sky.key).toContain('-g8fb5d6');
    expect(await px(sky.buf, CARD_PANEL_X.outerFront + 20, 20)).toBe('#8fb5d6'); // front, where the drawing is see-through
    expect(await px(white.buf, CARD_PANEL_X.outerFront + 20, 20)).toBe('#ffffff');
    expect(await px(sky.buf, 20, 20)).toBe('#ffffff'); // front-only: the rear stays white
    for (const x of [CARD_PANEL_X.insideFront + 20, CARD_PANEL_X.insideBack + 20]) expect(await px(sky.buf, x, CARD_SPREAD.heightPx - 20)).toBe('#ffffff'); // inside: white
  }, 120_000);

  it('a saved design keeps its colour (edge-to-edge products only)', async () => {
    const account = { id: ids.samId, name: 'Sam' };
    const a = await saveDesign(db, account, [], { assetId, variantSku: 'socks', transform: { scale: 0 }, ground: '#8FB5D6' });
    const b = await saveDesign(db, account, [], { assetId, variantSku: 'kidsTee', transform: { scale: 0 }, ground: '#8fb5d6' });
    expect(a.ok && b.ok).toBe(true);
    const rows = await db.select({ id: savedDesigns.id, ground: savedDesigns.ground }).from(savedDesigns).where(inArray(savedDesigns.id, [(a as { id: string }).id, (b as { id: string }).id]));
    const by = Object.fromEntries(rows.map((r) => [r.id, r.ground]));
    expect(by[(a as { id: string }).id]).toBe('#8fb5d6');
    expect(by[(b as { id: string }).id]).toBeNull();
  });
});
