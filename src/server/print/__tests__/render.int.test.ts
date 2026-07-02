import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { printTemplates, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { mmToPx, seedCatalogue } from '@/server/catalogue';
import { renderPrintFile } from '@/server/print/render';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

// A solid-colour source of given dimensions (compresses tiny).
const src = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer();

// The default framed print's canvas = print px + bleed on every side. Derived from the seeded
// template in beforeAll so the test survives catalogue geometry changes (e.g. the default size).
let CANVAS_W = 0;
let CANVAS_H = 0;

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
    const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
    const bleedPx = mmToPx(tpl!.bleedMm, tpl!.requiredDpi);
    CANVAS_W = tpl!.printWidthPx + 2 * bleedPx;
    CANVAS_H = tpl!.printHeightPx + 2 * bleedPx;
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
    const assetId = await ingest(await src(4200, 5400)); // plenty of resolution for the 11×14 canvas
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
    expect(origMeta.width).toBe(4200);
    expect(origMeta.height).toBe(5400);
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

  it('CONTAIN default (scale 0): whole image on the print file, white margins, canvas exact', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(4200, 5400)); // aspect 0.778 vs canvas ~0.787 → thin side margins
    const res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    keys.push(res.key);
    expect(res).toMatchObject({ widthPx: CANVAS_W, heightPx: CANVAS_H }); // the canvas never shrinks

    const grant = await getStorageObjectGrant(db, res.printObjectId, sam);
    const fetched = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
    const { data, info } = await sharp(fetched).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width! + x) * info.channels!;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    };
    const [rEdge, gEdge, bEdge] = at(3, Math.round(CANVAS_H / 2)); // inside the left margin → white
    expect(rEdge + gEdge + bEdge).toBeGreaterThan(720);
    const [rMid, gMid, bMid] = at(Math.round(CANVAS_W / 2), Math.round(CANVAS_H / 2)); // centre → the design
    expect(Math.abs(rMid - 200) + Math.abs(gMid - 120) + Math.abs(bMid - 60)).toBeLessThan(60);
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
