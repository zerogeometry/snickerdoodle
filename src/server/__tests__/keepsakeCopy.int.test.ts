import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, mlOperations, storageObjects } from '@/db/schema';
import { AuthzError } from '@/authz';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { copyKeepsake, copyWithoutBackground, discardUnusedCopy, keepsakeLooks } from '@/server/keepsakeCopy';
import { putBackgroundBack, removeBackgroundForAsset } from '@/server/magic';
import { BundlePreviewDenied, renderBundlePreview } from '@/server/print/bundleCompose';
import { IDENTITY_GEOMETRY, saveStudio } from '@/server/studio-doc';
import { deleteObject, derivativeKey, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';
import type { ModerationProviders } from '@/server/moderation';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const clean: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: false, labels: [] }) }, textReader: { read: async () => [] } };
// a drawing on plain white paper, so "remove background" has something to lift
const drawing = () =>
  sharp({ create: { width: 120, height: 120, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: { create: { width: 50, height: 50, channels: 3, background: { r: 30, g: 120, b: 200 } } }, left: 35, top: 35 }])
    .png()
    .toBuffer();
const shape = [{ id: 's', type: 'shape', shape: 'square', fill: '#d7352c', stroke: '#2b2118', strokeWidth: 0, texture: 'smooth', x: 0.75, y: 0.5, w: 0.3, h: 0.3, rotation: 0 }];

/**
 * Editing a keepsake from a picker (or the Create screen) makes a NEW keepsake (founder, 27 Oct) —
 * the keepsake it came from is never touched, so what's in a basket / an order prints as chosen.
 */
describe.skipIf(!DB || !S3)('keepsake copies for edits', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const made: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    const objs = made.length ? await db.select({ key: storageObjects.key }).from(storageObjects).where(inArray(storageObjects.assetId, made)) : [];
    for (const o of objs) await deleteObject(o.key).catch(() => {});
    if (made.length) await db.delete(mlOperations).where(inArray(mlOperations.assetId, made));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function keepsake(over: Partial<typeof assets.$inferInsert> = {}) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), childSubjectId: ids.oliviaId, keptInHome: true });
    made.push(a.assetId);
    if (Object.keys(over).length) await db.update(assets).set(over).where(eq(assets.id, a.assetId));
    return a.assetId;
  }
  const objectsOf = async (id: string) => db.select().from(storageObjects).where(eq(storageObjects.assetId, id));

  it('a copy is a new keepsake that starts exactly as the original looks — same child, controller, visibility, design', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const src = await keepsake({ visibility: 'EXTENDED' });
    const saved = await saveStudio(db, sam, src, { mask: null, geometry: IDENTITY_GEOMETRY, objects: shape }, { moderation: clean });
    const before = await objectsOf(src);

    const { assetId } = await copyKeepsake(db, sam, src);
    made.push(assetId);
    const [c] = await db.select().from(assets).where(eq(assets.id, assetId));
    const [s] = await db.select().from(assets).where(eq(assets.id, src));
    expect(c!.keptInHome).toBe(true);
    expect(c!.childSubjectId).toBe(ids.oliviaId);
    expect(c!.controllerAccountId).toBe(s!.controllerAccountId);
    expect(c!.visibility).toBe('EXTENDED');
    expect(c!.studioDoc).toEqual(s!.studioDoc);
    // its own design, byte-for-byte the same look
    const design = (await objectsOf(assetId)).find((o) => o.key === derivativeKey(assetId, 'design'))!;
    expect(design.sha256).toBe(before.find((o) => o.id === saved.sourceObjectId)!.sha256);
    const looks = await keepsakeLooks(db, [{ id: assetId, studioDoc: c!.studioDoc }, { id: src, studioDoc: s!.studioDoc }]);
    expect(looks.get(assetId)!.kind).toBe('design');
    expect(looks.get(src)!.id).toBe(saved.sourceObjectId);
    // the original keepsake is untouched
    expect((await objectsOf(src)).map((o) => `${o.key}:${o.sha256}`).sort()).toEqual(before.map((o) => `${o.key}:${o.sha256}`).sort());
  });

  it('remove background from a picker: a new keepsake with the background lifted — the original untouched', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const src = await keepsake();
    const before = await objectsOf(src);
    const r = await copyWithoutBackground(db, sam, src, { keepEnclosedPaper: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    made.push(r.assetId);
    const [c] = await db.select().from(assets).where(eq(assets.id, r.assetId));
    const look = (await keepsakeLooks(db, [{ id: r.assetId, studioDoc: c!.studioDoc }])).get(r.assetId)!;
    expect(look.kind).toBe('cutout');
    expect((await sharp(await getObjectBytes(look.key)).metadata()).hasAlpha).toBe(true);
    expect(await objectsOf(src)).toHaveLength(before.length);
    expect((await objectsOf(src)).some((o) => o.key === derivativeKey(src, 'cutout'))).toBe(false);
  });

  // ── founder, 29 Oct: "remove background showed an OLD background" — a privacy check first ──
  it('a stale cut-out (a background later put back) never rides into a copy, where it could become its look', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const src = await keepsake(); // no Studio recipe: its look is the drawing itself
    await removeBackgroundForAsset(db, sam, src, { keepEnclosedPaper: true }); // a cut-out made… and never used
    expect((await objectsOf(src)).some((o) => o.key === derivativeKey(src, 'cutout'))).toBe(true);
    const { assetId } = await copyKeepsake(db, sam, src);
    made.push(assetId);
    expect((await objectsOf(assetId)).some((o) => o.key === derivativeKey(assetId, 'cutout'))).toBe(false);
    const [c] = await db.select().from(assets).where(eq(assets.id, assetId));
    expect((await keepsakeLooks(db, [{ id: assetId, studioDoc: c!.studioDoc }])).get(assetId)!.kind).not.toBe('cutout');
  });

  it('"put the background back" on the drawing in progress DELETES its cut-out — only its own, only when it IS the cut-out', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const loose = await keepsake({ keptInHome: false }); // a drawing in progress, not a keepsake yet
    const cut = await removeBackgroundForAsset(db, sam, loose, { keepEnclosedPaper: true });
    // a different object id (a design, or another asset's) deletes nothing
    expect(await putBackgroundBack(db, sam, loose, '00000000-0000-0000-0000-000000000000')).toBe(false);
    expect((await objectsOf(loose)).some((o) => o.id === cut.objectId)).toBe(true);
    // a stranger is refused by the gate
    const mallory = await resolveViewerContext(db, ids.malloryId, ids.hartleyId);
    await expect(putBackgroundBack(db, mallory, loose, cut.objectId)).rejects.toBeInstanceOf(AuthzError);
    // its own cut-out: gone, storage row and all
    expect(await putBackgroundBack(db, sam, loose, cut.objectId)).toBe(true);
    expect((await objectsOf(loose)).some((o) => o.key === derivativeKey(loose, 'cutout'))).toBe(false);
    // a keepsake's cut-out is never deleted this way (its edits are copies of their own)
    const kept = await keepsake();
    const kcut = await removeBackgroundForAsset(db, sam, kept, { keepEnclosedPaper: true });
    expect(await putBackgroundBack(db, sam, kept, kcut.objectId)).toBe(false);
  });

  it('the bundle picture never reads another asset’s object — even one the viewer could see on its own', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [a, b] = [await keepsake(), await keepsake()];
    const bcut = await removeBackgroundForAsset(db, sam, b, { keepEnclosedPaper: true });
    // asset a + asset b's cut-out id → refused before any byte is read
    await expect(renderBundlePreview(db, { accountId: ids.samId, uploadClaims: [] }, { layout: 'x2', placemat: { assetId: a, sourceObjectId: bcut.objectId }, coaster: null, ornaments: [] })).rejects.toBeInstanceOf(BundlePreviewDenied);
  });

  it('a keepsake never saved in the Studio shows its drawing', async () => {
    const src = await keepsake();
    const [row] = await db.select().from(assets).where(eq(assets.id, src));
    expect((await keepsakeLooks(db, [{ id: src, studioDoc: row!.studioDoc }])).get(src)!.kind).toMatch(/original|trimmed/);
  });

  it('only someone who can add to the family copies; an unsaved copy is tidied away only by its maker, only while fresh', async () => {
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // EXTENDED · VIEW_BUY: can't add creations
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    const src = await keepsake({ visibility: 'EXTENDED' });
    await expect(copyKeepsake(db, rosie, src)).rejects.toBeInstanceOf(AuthzError);
    await expect(copyKeepsake(db, await resolveViewerContext(db, ids.blakeId, ids.bloomId), src)).rejects.toBeInstanceOf(AuthzError);

    const { assetId } = await copyKeepsake(db, sam, src);
    made.push(assetId);
    expect(await discardUnusedCopy(db, jo, assetId)).toBe(false); // not Jo's
    expect(await discardUnusedCopy(db, sam, assetId, new Date(Date.now() + 7 * 3600_000))).toBe(false); // no longer fresh
    expect(await discardUnusedCopy(db, sam, assetId)).toBe(true);
    expect(await db.select().from(assets).where(eq(assets.id, assetId))).toHaveLength(0);
    expect(await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))).toHaveLength(0);
    expect(await db.select().from(assets).where(eq(assets.id, src))).toHaveLength(1); // the original stays
  });

  it('a CSAM-blocked keepsake is never copied', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const src = await keepsake({ moderationStatus: 'BLOCKED' });
    await expect(copyKeepsake(db, sam, src)).rejects.toBeTruthy();
  });
});
