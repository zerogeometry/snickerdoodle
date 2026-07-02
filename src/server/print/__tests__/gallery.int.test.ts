import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { productVariants } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { composeMockup } from '@/server/print/compositor';
import { deleteObject, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * TEMP visual-verification gallery (run manually): composes the launch range's default
 * variants through the REAL engine (authz → template → mask → quad) with a synthetic
 * "house" drawing and writes the WebPs + a contact sheet to GALLERY_OUT for eyeballing
 * placement. Skipped unless GALLERY_OUT is set, so the suite never pays for it.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const OUT = process.env.GALLERY_OUT;

const KEYS = ['framedPrint', 'mug', 'cushion', 'jigsaw', 'blanket', 'apron', 'bauble', 'sack'];

async function houseDrawing(): Promise<Buffer> {
  const svg = `<svg width="1600" height="2000" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="2000" fill="#FBF5E9"/>
    <rect x="500" y="900" width="600" height="500" fill="none" stroke="#C8623A" stroke-width="30"/>
    <path d="M470 900 L800 650 L1130 900" fill="none" stroke="#C8623A" stroke-width="30"/>
    <rect x="720" y="1150" width="180" height="250" fill="none" stroke="#84BBD0" stroke-width="24"/>
    <circle cx="1300" cy="450" r="120" fill="#F2A640"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe.skipIf(!DB || !S3 || !OUT)('mockup gallery — visual verification (manual)', () => {
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
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('composes every templated default variant and writes a contact sheet', async () => {
    mkdirSync(OUT!, { recursive: true });
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await houseDrawing(), keptInHome: true });
    keys.push(r.key);

    const cells: { label: string; buf: Buffer }[] = [];
    for (const sku of KEYS) {
      const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, sku));
      expect(v, `variant ${sku}`).toBeTruthy();
      const res = await composeMockup(db, sam, {
        assetId: r.assetId,
        variantId: v!.id,
        transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
        size: 'zoom',
      });
      keys.push(res.key);
      const buf = Buffer.from(await getObjectBytes(res.key));
      writeFileSync(path.join(OUT!, `m-${sku}.webp`), buf);
      cells.push({ label: sku, buf });
    }

    // Contact sheet: 4 across.
    const CELL = 320, PAD = 20, COLS = 4;
    const rows = Math.ceil(cells.length / COLS);
    const W = COLS * (CELL + PAD) + PAD, H = rows * (CELL + PAD + 16) + PAD;
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < cells.length; i++) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = PAD + col * (CELL + PAD), y = PAD + row * (CELL + PAD + 16);
      layers.push({ input: await sharp(cells[i]!.buf).resize(CELL, CELL, { fit: 'contain', background: '#fff' }).png().toBuffer(), left: x, top: y + 16 });
      layers.push({ input: Buffer.from(`<svg width="${CELL}" height="16"><text x="2" y="12" font-family="sans-serif" font-size="12" fill="#2E2723">${cells[i]!.label}</text></svg>`), left: x, top: y });
    }
    await sharp({ create: { width: W, height: H, channels: 3, background: '#FBF5E9' } }).composite(layers).png().toFile(path.join(OUT!, 'gallery.png'));
    expect(cells.length).toBe(KEYS.length);
  }, 120_000);
});
