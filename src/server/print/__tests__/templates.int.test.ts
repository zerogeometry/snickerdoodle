import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { printTemplates, productVariants, templateAssets } from '@/db/schema';
import { seedCatalogue } from '@/server/catalogue';
import { setMockupTemplate } from '@/server/print/templates';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const QUAD: [number, number][] = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];

describe.skipIf(!DB || !S3)('setMockupTemplate — authoring path (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let variantId = '';
  const keys: string[] = [];
  const taIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    await seedCatalogue(db);
    const [mug] = await db.select().from(productVariants).where(eq(productVariants.sku, 'mug'));
    variantId = mug!.id;
  });

  afterAll(async () => {
    // Reset the shared variant's mockup template + drop the test blanks.
    if (variantId) await db.update(printTemplates).set({ blankObjectId: null, printQuad: null, materialClass: 'PAPER', templateVersion: 1 }).where(eq(printTemplates.variantId, variantId)).catch(() => {});
    for (const id of taIds) await db.delete(templateAssets).where(eq(templateAssets.id, id)).catch(() => {});
    for (const k of keys) await deleteObject(k).catch(() => {});
    await client.end();
  });

  it('uploads a non-child blank, wires the variant, and BUMPS the version', async () => {
    const [before] = await db.select({ v: printTemplates.templateVersion }).from(printTemplates).where(eq(printTemplates.variantId, variantId));
    const blank = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 235, g: 230, b: 220 } } }).webp().toBuffer();

    const res = await setMockupTemplate(db, { variantId, blank, contentType: 'image/webp', printQuad: QUAD, materialClass: 'CERAMIC' });
    keys.push(res.key);
    taIds.push(res.blankObjectId);

    expect(res.templateVersion).toBe((before!.v ?? 1) + 1); // bumped → cached mockups invalidate
    expect(res.key).toContain(`templates/${variantId}/v${res.templateVersion}/blank.webp`);

    const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
    expect(tpl!.blankObjectId).toBe(res.blankObjectId);
    expect(tpl!.materialClass).toBe('CERAMIC');
    expect(tpl!.templateVersion).toBe(res.templateVersion);
    expect(tpl!.printQuad).toEqual(QUAD);

    const [ta] = await db.select().from(templateAssets).where(eq(templateAssets.id, res.blankObjectId));
    expect(ta!.kind).toBe('BLANK');
    expect(ta!.widthPx).toBe(600);
    expect(ta!.sha256).toBeTruthy();
    // structurally non-child: template_assets has no assetId column at all
    expect('assetId' in ta!).toBe(false);
  });

  it('re-authoring bumps the version again (new key, clean re-render)', async () => {
    const blank = await sharp({ create: { width: 640, height: 820, channels: 3, background: { r: 240, g: 232, b: 222 } } }).webp().toBuffer();
    const first = await db.select({ v: printTemplates.templateVersion }).from(printTemplates).where(eq(printTemplates.variantId, variantId));
    const res = await setMockupTemplate(db, { variantId, blank, printQuad: QUAD });
    keys.push(res.key);
    taIds.push(res.blankObjectId);
    expect(res.templateVersion).toBe((first[0]!.v ?? 1) + 1);
  });
});
