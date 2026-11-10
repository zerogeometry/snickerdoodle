import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { giftLinks, orderItemArtwork, orderItems, orders, printTemplates, productVariants, savedDesigns } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import type { ViewerContext } from '@/authz';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { seedCatalogue } from '@/server/catalogue';
import { createGiftLink, giftLinkPreview, placeGiftLinkOrder, type GiftItem } from '@/server/giftLinks';
import { ingestOriginalAsset } from '@/server/ingest';
import { composeMockup, persistDerivative } from '@/server/print/compositor';
import { drawProductMockup, type DrawnProductKey } from '@/server/print/drawnMockups';
import type { RawTransform } from '@/server/print/geometry';
import { setMockupTemplate } from '@/server/print/templates';
import { saveDesign } from '@/server/savedDesigns';
import { deleteObject, derivativeKey } from '@/storage';
import { ensureTestCosts } from '@/test/costFixture';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/**
 * Founder (10 Nov): "when I share a product for gifting with a family member, I need them to see the
 * exact drawing on the exact product, exactly as it appeared on the inviter's customization."
 *
 * A shared design's gift picture is the SAME picture the parent's own preview makes from the same
 * choices — the drawing (or its tidied-up version), its placement, the product size + colour, the
 * base colour — frozen when the link is made, unchanged by later edits, and the print order uses the
 * very same choices.
 */
describe.skipIf(!DB || !S3)('a gift link shows the design exactly as the parent made it (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let sam: ViewerContext;
  const keys: string[] = [];
  const orderRefs: string[] = [];
  /** print_templates rows this test gave a drawn photo (a fresh CI database has none) — put back after. */
  const restoreTemplates: (typeof printTemplates.$inferSelect)[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // dev "mark paid" path — never a real Checkout session in tests
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    await ensureTestCosts(db);
    sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
  }, 120_000);

  afterAll(async () => {
    if (orderRefs.length) await db.delete(orders).where(inArray(orders.ref, orderRefs));
    await db.delete(giftLinks).where(eq(giftLinks.familyId, ids.hartleyId));
    for (const row of restoreTemplates) {
      const { id, ...was } = row;
      await db.update(printTemplates).set(was).where(eq(printTemplates.id, id));
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  /** The variant, with a product photo to compose on: the staged one, else a drawn one for this run. */
  async function variantWithPhoto(sku: string, drawn: DrawnProductKey): Promise<string> {
    const [row] = await db
      .select({ t: printTemplates })
      .from(printTemplates)
      .innerJoin(productVariants, eq(productVariants.id, printTemplates.variantId))
      .where(eq(productVariants.sku, sku));
    expect(row, `${sku} needs a print template`).toBeTruthy();
    if (!row!.t.blankObjectId || !row!.t.printQuad) {
      restoreTemplates.push(row!.t);
      const d = drawProductMockup(drawn, {}, { w: row!.t.printWidthPx, h: row!.t.printHeightPx });
      await setMockupTemplate(db, { variantId: row!.t.variantId, blank: d.blank, contentType: 'image/png', printQuad: d.quad, materialClass: d.material, mask: d.mask, overlay: d.overlay });
    }
    return row!.t.variantId;
  }

  /** A lopsided drawing (red left, blue right, a yellow sun top-left), so a placement change shows. */
  async function keptDrawing(): Promise<string> {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
      <rect width="600" height="900" fill="#c8402a"/><rect x="600" width="600" height="900" fill="#2f5da8"/>
      <circle cx="200" cy="180" r="130" fill="#f6c445"/></svg>`;
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await sharp(Buffer.from(svg)).png().toBuffer(), keptInHome: true });
    keys.push(r.key);
    return r.assetId;
  }

  /** A "tidied-up" version of the drawing (here: greyscale), as a magic edit leaves it. */
  async function tidiedVersion(assetId: string): Promise<string> {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
      <rect width="600" height="900" fill="#555"/><rect x="600" width="600" height="900" fill="#999"/>
      <circle cx="200" cy="180" r="130" fill="#eee"/></svg>`;
    const key = derivativeKey(assetId, `tidy-${ids.nonce}`);
    keys.push(key);
    return persistDerivative(db, assetId, key, await sharp(Buffer.from(svg)).webp().toBuffer());
  }

  /** The parent's own preview of these choices (the customise page's picture), as raw pixels. */
  async function parentPreview(assetId: string, variantId: string, choices: { transform: RawTransform; sourceObjectId?: string; ground?: string }) {
    const res = await composeMockup(db, sam, { assetId, variantId, size: 'thumb', ...choices });
    const { url } = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
    return { mockupObjectId: res.mockupObjectId, bytes: Buffer.from(await (await fetch(url)).arrayBuffer()) };
  }

  /** Mean per-channel difference (0–255) between two pictures, compared at the first one's size. */
  async function difference(a: Buffer, b: Buffer): Promise<number> {
    const { data: pa, info } = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pb = await sharp(b).removeAlpha().resize(info.width, info.height, { fit: 'fill' }).raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < pa.length; i++) sum += Math.abs(pa[i]! - pb[i]!);
    return sum / pa.length;
  }

  const cases = [
    { name: 'playing cards, moved + enlarged, tidied-up version, a base colour', sku: 'playingCards', drawn: 'playingCards' as const, tidied: true, ground: '#2f5da8' },
    { name: 'a tea towel (repeat pattern) with a base colour', sku: 'teaTowel', drawn: 'teaTowel' as const, tidied: false, ground: '#e8786e' },
  ];

  for (const c of cases) {
    it(`${c.name}: the relative sees the parent's picture, frozen, and the order prints the same choices`, async () => {
      const variantId = await variantWithPhoto(c.sku, c.drawn);
      const assetId = await keptDrawing();
      const sourceObjectId = c.tidied ? await tidiedVersion(assetId) : undefined;
      const transform = { scale: 1.4, offsetX: 0.18, offsetY: -0.1, rotationDeg: 0 };

      // the parent saves the design ("+ keepsake") and shares it as a gift link
      const saved = await saveDesign(db, { id: ids.samId, name: null }, [], { assetId, variantSku: c.sku, transform, sourceObjectId, ground: c.ground });
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      const [design] = await db.select().from(savedDesigns).where(eq(savedDesigns.id, saved.id));
      const link = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [], designIds: [saved.id] });
      const [row] = await db.select().from(giftLinks).where(eq(giftLinks.id, link.id));
      const item = (row!.items as GiftItem[])[0]!;
      expect(item).toMatchObject({ assetId, productKey: c.sku, designId: saved.id });
      expect(item.mockupObjectId).toBeTruthy(); // the product picture was made + frozen when shared

      // what the parent saw on their customise page, from exactly the saved choices
      const parent = await parentPreview(assetId, variantId, {
        transform: design!.transform as RawTransform,
        sourceObjectId: design!.sourceObjectId ?? undefined,
        ground: design!.ground ?? undefined,
      });
      expect(item.mockupObjectId).toBe(parent.mockupObjectId); // literally the same picture

      // what the family member's gift page shows (a phone-sized copy of that picture)
      const gift = await giftLinkPreview(db, link.token, assetId, c.sku);
      expect(gift).not.toBeNull();
      expect(await difference(parent.bytes, gift!)).toBeLessThan(4); // only re-encoding noise

      // …and the comparison would catch a different design: the plain whole-drawing default differs
      const plain = await parentPreview(assetId, variantId, { transform: { scale: 0 } });
      expect(await difference(plain.bytes, gift!)).toBeGreaterThan(8);

      // the parent changes their saved design afterwards: the shared picture does not move
      await db.update(savedDesigns).set({ transform: { scale: 0.6, offsetX: -0.3, offsetY: 0.2, rotationDeg: 0 }, ground: null }).where(eq(savedDesigns.id, saved.id));
      const [after] = await db.select().from(giftLinks).where(eq(giftLinks.id, link.id));
      expect((after!.items as GiftItem[])[0]).toEqual(item);
      expect(await difference(gift!, (await giftLinkPreview(db, link.token, assetId, c.sku))!)).toBe(0);

      // the relative buys it: the print order carries the same drawing, product, placement + colour
      const res = await placeGiftLinkOrder(db, { token: link.token, account: null, joinProvenance: null, fromName: 'Granny' });
      expect(res.ok).toBe(true);
      orderRefs.push(res.ref!);
      const [line] = await db
        .select({ productKey: orderItems.productKey, art: orderItemArtwork })
        .from(orderItems)
        .innerJoin(orderItemArtwork, eq(orderItemArtwork.orderItemId, orderItems.id))
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(eq(orders.ref, res.ref!));
      expect(line!.productKey).toBe(c.sku);
      expect(line!.art.assetId).toBe(assetId);
      expect(line!.art.variantId).toBe(variantId);
      expect(line!.art.transform).toMatchObject(design!.transform as object);
      expect(line!.art.sourceObjectId ?? null).toBe(design!.sourceObjectId ?? null);
      expect(line!.art.ground ?? null).toBe(design!.ground ?? null);
    }, 60_000);
  }
});
