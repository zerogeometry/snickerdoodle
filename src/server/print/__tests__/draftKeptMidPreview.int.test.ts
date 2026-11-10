import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, printTemplates, products, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import type { ViewerContext } from '@/authz';
import { adoptEphemeralDraft, resolveAssetViewer, resolveViewerContext } from '@/server/assets';
import { ingestEphemeralUpload } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { drawProductMockup } from '@/server/print/drawnMockups';
import { composeForViewer } from '@/server/print/mockupRequest';
import { setMockupTemplate } from '@/server/print/templates';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/**
 * The range's previews start while the drawing is still a guest DRAFT (viewer = its upload claim).
 * "+ keepsake" files that same drawing into the family mid-flight, retiring the claim, so the
 * claim-only viewer is refused and the shopper saw placeholder pictures. A preview in that spot
 * now looks its viewer up again and tries once more — through the same gate, so only someone in
 * the family gets the picture.
 */
describe.skipIf(!DB || !S3)('a draft kept while its previews are in flight (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let variantId = '';
  const productIds: string[] = [];
  const assetIds: string[] = [];
  const tf = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    // a private copy of the bandana with a drawn template (no shop photo needed)
    const [real] = await db
      .select({ t: printTemplates, attrs: productVariants.attributes })
      .from(printTemplates)
      .innerJoin(productVariants, eq(printTemplates.variantId, productVariants.id))
      .where(eq(productVariants.sku, 'petBandana'));
    const key = `zz-keptdraft-${ids.nonce}`;
    const [prod] = await db.insert(products).values({ key, category: 'PRINT', label: key, active: false, visibleInShop: false }).returning();
    productIds.push(prod!.id);
    const [v] = await db.insert(productVariants).values({ productId: prod!.id, sku: key, label: key, attributes: real!.attrs, pricePence: 100, active: false }).returning();
    variantId = v!.id;
    const { id: _id, variantId: _v, ...tpl } = real!.t;
    await db.insert(printTemplates).values({ ...tpl, variantId, blankObjectId: null, printQuad: null, maskObjectId: null, lightingObjectId: null });
    const d = drawProductMockup('petBandana', {}, { w: tpl.printWidthPx, h: tpl.printHeightPx });
    await setMockupTemplate(db, { variantId, blank: d.blank, contentType: 'image/png', printQuad: d.quad, materialClass: d.material, mask: d.mask, overlay: d.overlay });
  });

  afterAll(async () => {
    for (const id of assetIds) {
      for (const o of await db.select().from(storageObjects).where(eq(storageObjects.assetId, id))) await deleteObject(o.key).catch(() => {});
    }
    if (assetIds.length) await db.delete(assets).where(inArray(assets.id, assetIds)).catch(() => {});
    if (productIds.length) await db.delete(products).where(inArray(products.id, productIds)).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  /** A guest draft, the viewer a preview resolved for it, then "+ keepsake" by Sam into his family. */
  async function draftKeptMidPreview(): Promise<{ assetId: string; claimId: string; stale: ViewerContext }> {
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 47, g: 93, b: 168 } } }).png().toBuffer();
    const { assetId, claimId } = await ingestEphemeralUpload(db, { buffer: png, kind: 'DRAWING', termsVersion: 'test-v1' });
    assetIds.push(assetId);
    const stale = await resolveAssetViewer(db, assetId, ids.samId, [claimId]);
    expect(stale.uploadClaim).toBe(claimId); // the preview set off as the draft's claim holder
    await adoptEphemeralDraft(db, ids.samId, ids.hartleyId, assetId, [claimId]);
    return { assetId, claimId, stale };
  }

  it('without a second look the stale draft viewer is refused (the placeholder the shopper saw)', async () => {
    const { assetId, stale } = await draftKeptMidPreview();
    const res = await composeForViewer(db, stale, { assetId, variantId, transform: tf, size: 'thumb' }, { needsAuth: false });
    expect(res.ok).toBe(false);
  });

  it('the parent who kept it gets the picture: the viewer is looked up again and the compose retried', async () => {
    const { assetId, claimId, stale } = await draftKeptMidPreview();
    const res = await composeForViewer(db, stale, { assetId, variantId, transform: tf, size: 'thumb' }, {
      needsAuth: false,
      refreshViewer: () => resolveAssetViewer(db, assetId, ids.samId, [claimId]),
    });
    expect(res.ok).toBe(true);
  });

  it('a signed-out guest still holding the (now retired) claim stays refused', async () => {
    const { assetId, claimId } = await draftKeptMidPreview();
    const guest = { accountId: null, membership: null, uploadClaim: claimId } satisfies ViewerContext;
    const res = await composeForViewer(db, guest, { assetId, variantId, transform: tf, size: 'thumb' }, {
      needsAuth: true,
      refreshViewer: () => resolveAssetViewer(db, assetId, null, [claimId]),
    });
    expect(res.ok).toBe(false);
  });

  it('someone outside the family holding the claim stays refused after the second look', async () => {
    const { assetId, claimId } = await draftKeptMidPreview();
    const blakeAsDraftHolder = { accountId: ids.blakeId, membership: null, uploadClaim: claimId } satisfies ViewerContext;
    const res = await composeForViewer(db, blakeAsDraftHolder, { assetId, variantId, transform: tf, size: 'thumb' }, {
      needsAuth: false,
      refreshViewer: () => resolveAssetViewer(db, assetId, ids.blakeId, [claimId]),
    });
    expect(res.ok).toBe(false);
  });

  it('only a draft-claim viewer gets a second look: an ordinary refusal is never retried', async () => {
    const { assetId } = await draftKeptMidPreview();
    const blake = await resolveViewerContext(db, ids.blakeId, null);
    let asked = 0;
    const res = await composeForViewer(db, blake, { assetId, variantId, transform: tf, size: 'thumb' }, {
      needsAuth: false,
      refreshViewer: async () => {
        asked++;
        return resolveViewerContext(db, ids.samId, ids.hartleyId);
      },
    });
    expect(res.ok).toBe(false);
    expect(asked).toBe(0);
  });
});
