import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { renderPrintFile } from '@/server/print/render';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { WATCH_STRAP_SIZES } from '@/lib/watch-strap';
import { deleteObject, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * The WATCH STRAP's real print file (founder, 5 Nov: "match Prodigi exactly"): rendered through the order-time
 * renderer at the shop's DEFAULT placement, for both sizes. The file must be Prodigi's exact px (38 mm 305×2738,
 * 42 mm 363×2932 — sandbox GET /v4.0/products) and the drawing must cover EVERY part Prodigi prints — both
 * leather halves of its template (src/lib/watch-strap.ts, traced from prodigi-38mm-strap.png / -42mm-) — with
 * no unprinted white left on them. The drawing here is a solid colour, so any white is a gap.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const COLOUR = [47, 93, 168] as const; // cobalt

describe.skipIf(!DB || !S3)('the watch strap’s print file covers Prodigi’s printed halves (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let assetId = '';
  const keys: string[] = [];
  const art = { width: 1600, height: 1200 }; // a landscape drawing, like most children's paper

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const buffer = await sharp({ create: { ...art, channels: 3, background: { r: COLOUR[0], g: COLOUR[1], b: COLOUR[2] } } }).png().toBuffer();
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer, keptInHome: true });
    assetId = ing.assetId;
    keys.push(ing.key);
  }, 120_000);

  afterAll(async () => {
    if (assetId && db) {
      const objs = await db.select({ key: storageObjects.key }).from(storageObjects).where(inArray(storageObjects.assetId, [assetId]));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client?.end();
  });

  for (const s of WATCH_STRAP_SIZES) {
    it(`${s.size} (${s.sku}): ${s.px.w}×${s.px.h} px, the drawing on every printed part of both halves`, async () => {
      const sku = s.size === 'small' ? 'watchStrap' : `watchStrap-${s.size}`;
      const [v] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, sku));
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const r = await renderPrintFile(db, sam, { assetId, variantId: v!.id, transform: defaultTransformFor('watchStrap', art.width / art.height) });
      const [obj] = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.id, r.printObjectId));
      keys.push(obj!.key);
      const { data, info } = await sharp(await getObjectBytes(obj!.key)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([s.px.w, s.px.h]);

      // every row of each half (Prodigi's traced outline, 2 px in from its edge): the drawing's colour, no white
      let checked = 0;
      const misses: string[] = [];
      for (const rows of s.pieces) {
        for (let i = 0; i + 1 < rows.length; i++) {
          const [y0, l0, r0] = rows[i]!, [y1, l1, r1] = rows[i + 1]!;
          for (let y = Math.ceil(y0 * info.height) + 2; y < Math.floor(y1 * info.height) - 2; y += 7) {
            const f = (y / info.height - y0) / Math.max(1e-9, y1 - y0);
            const xl = Math.ceil((l0 + (l1 - l0) * f) * info.width) + 2, xr = Math.floor((r0 + (r1 - r0) * f) * info.width) - 2;
            for (let x = xl; x <= xr; x += 5) {
              const i3 = (y * info.width + x) * 3;
              const off = Math.abs(data[i3]! - COLOUR[0]) + Math.abs(data[i3 + 1]! - COLOUR[1]) + Math.abs(data[i3 + 2]! - COLOUR[2]);
              checked++;
              if (off > 30 && misses.length < 5) misses.push(`(${x},${y}) rgb ${data[i3]},${data[i3 + 1]},${data[i3 + 2]}`);
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(500);
      expect(misses, 'a printed part of the strap the drawing doesn’t reach').toEqual([]);
    }, 60_000);
  }
});
