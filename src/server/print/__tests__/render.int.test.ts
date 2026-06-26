import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { renderPrintFile } from '@/server/print/render';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

// A solid-colour source of given dimensions (compresses tiny).
const src = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer();

// framedPrint = A4 @ 300dpi (210×297mm) → 2480×3508 print + 35px bleed each side = 2550×3578 canvas.
const CANVAS_W = 2550;
const CANVAS_H = 3578;

describe.skipIf(!DB || !S3)('print-file render — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let variantId = '';
  const keys: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    variantId = v!.id;
  });

  afterAll(async () => {
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function ingest(buf: Buffer) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: buf, keptInHome: true });
    keys.push(r.key);
    return r.assetId;
  }

  it('renders a print file at exactly the bleed canvas + the product DPI, without an upscale', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(3000, 4200)); // plenty of resolution
    const res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    keys.push(res.key);

    expect(res).toMatchObject({ widthPx: CANVAS_W, heightPx: CANVAS_H, renderedDpi: 300, upscaled: false });

    // fetch the rendered file via the authz-gated grant; check its real pixels + DPI
    const grant = await getStorageObjectGrant(db, res.printObjectId, sam);
    const fetched = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
    const meta = await sharp(fetched).metadata();
    expect(meta.width).toBe(CANVAS_W);
    expect(meta.height).toBe(CANVAS_H);
    expect(meta.density).toBe(300);

    // the ORIGINAL is untouched (still its source dimensions, not the canvas)
    const [orig] = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
    const origGrant = await getStorageObjectGrant(db, orig!.id, sam);
    const origMeta = await sharp(Buffer.from(await (await fetch(origGrant.url)).arrayBuffer())).metadata();
    expect(origMeta.width).toBe(3000);
    expect(origMeta.height).toBe(4200);
    // and a DERIVATIVE print file now exists alongside it
    const derivs = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'DERIVATIVE')));
    expect(derivs.length).toBeGreaterThanOrEqual(1);
    expect(derivs[0]!.writeOnce).toBe(true);
  });

  it('flags an upscale for a low-res source (still fills the canvas)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(1200, 1680));
    const res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    keys.push(res.key);
    expect(res.upscaled).toBe(true);
    expect(res.effectiveDpi).toBeLessThan(300);
    expect(res.widthPx).toBe(CANVAS_W); // still rendered to spec
  });

  it('BLOCKS a source too low-res to print', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(400, 560));
    await expect(renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } })).rejects.toThrow();
  });

  it('refuses to render for a viewer who may not see the asset (no print file produced)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(3000, 4200)); // a FAMILY asset
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // Extended circle → denied
    await expect(renderPrintFile(db, rosie, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } })).rejects.toBeInstanceOf(AuthzError);
    // nothing was written
    const derivs = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'DERIVATIVE')));
    expect(derivs).toHaveLength(0);
    void sam;
  });
});
