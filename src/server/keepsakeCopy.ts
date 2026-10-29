import 'server-only';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { AuthzError, type ViewerContext } from '@/authz';
import { assets, orderItemArtwork, storageObjects } from '@/db/schema';
import { deleteObjectConfirmed, derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { DbHandle } from './db';
import { eraseAsset, getViewableAssetOrThrow } from './assets';
import { ingestOriginalAsset } from './ingest';
import { removeBackgroundForAsset } from './magic';
import { IDENTITY_GEOMETRY } from './studio-doc';

/** The derivatives a copy carries over, so it starts exactly as the keepsake looks. */
const CARRIED = ['trimmed', 'cutout', 'design'] as const;
/** A copy made for an edit that was never saved may be tidied away by whoever made it, this long after. */
const DISCARD_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Editing a keepsake from the card-pack / calendar picker makes a NEW keepsake (founder, 27 Oct: "save
 * the edited variant … as a new keepsake, so we don't overwrite a keepsake previously saved"). The
 * copy starts as an exact clone of the keepsake as it looks now — its original (re-ingested: EXIF
 * stripped, stored privately, screened again), its trimmed / cutout / design derivatives and its
 * Studio recipe — then the edit is made on the COPY. The keepsake it came from is never touched, so
 * anything already in a basket or an order prints exactly what was chosen.
 *
 * Authz: the viewer must see the keepsake and be able to add creations to its family (ingest's own
 * CONTRIBUTE gate). The copy keeps the keepsake's child, controller and visibility (never wider).
 * A CSAM-blocked keepsake is never copied.
 */
export async function copyKeepsake(db: DbHandle, viewer: ViewerContext, sourceId: string): Promise<{ assetId: string }> {
  await getViewableAssetOrThrow(db, sourceId, viewer); // ← the gate
  const [src] = await db.select().from(assets).where(eq(assets.id, sourceId));
  if (!src?.familyId || !src.keptInHome || src.moderationStatus === 'BLOCKED') throw new AuthzError({ allowed: false, reason: 'not a keepsake that can be copied' });
  const [orig] = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, sourceId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!orig) throw new Error('no original to copy');

  const copy = await ingestOriginalAsset(db, viewer, {
    familyId: src.familyId,
    kind: src.kind,
    buffer: await getObjectBytes(orig.key),
    childSubjectId: src.childSubjectId ?? undefined,
    keptInHome: true,
  });

  // carry the look over: the derivatives byte-for-byte (so a design's real-size record still matches
  // its hash), the Studio recipe, and the same visibility. A cut-out is carried ONLY when the keepsake's
  // look can use it (it has a Studio recipe) — a stale one (a background later put back) never rides
  // into the copy, where it could become the copy's look (founder, 29 Oct: an old background came back).
  const carried = CARRIED.filter((k) => k !== 'cutout' || !!src.studioDoc);
  const derived = await db
    .select()
    .from(storageObjects)
    .where(inArray(storageObjects.key, carried.map((k) => derivativeKey(sourceId, k))));
  const { bucket } = getS3();
  for (const d of derived) {
    const kind = CARRIED.find((k) => d.key === derivativeKey(sourceId, k))!;
    const key = derivativeKey(copy.assetId, kind);
    await putObject(key, await getObjectBytes(d.key), d.contentType ?? 'image/png');
    await db
      .insert(storageObjects)
      .values({ assetId: copy.assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: d.contentType, byteSize: d.byteSize, sha256: d.sha256, exifStripped: true, writeOnce: false })
      .onConflictDoNothing({ target: storageObjects.key });
  }
  await db.update(assets).set({ visibility: src.visibility, studioDoc: src.studioDoc }).where(eq(assets.id, copy.assetId));
  return { assetId: copy.assetId };
}

/**
 * "Remove background" from the picker: a new keepsake with the background lifted — the drawing itself
 * (any earlier Studio extras aren't carried into a bare cutout). `nochange` when there's no plain
 * background to lift; then no copy is left behind.
 */
export async function copyWithoutBackground(
  db: DbHandle,
  viewer: ViewerContext,
  sourceId: string,
  opts: { keepEnclosedPaper?: boolean } = {},
): Promise<{ ok: true; assetId: string } | { ok: false; reason: 'nochange' }> {
  const { assetId } = await copyKeepsake(db, viewer, sourceId);
  try {
    await removeBackgroundForAsset(db, viewer, assetId, opts);
  } catch (e) {
    await eraseAsset(db, { id: assetId, familyId: (await db.select({ f: assets.familyId }).from(assets).where(eq(assets.id, assetId)))[0]?.f ?? null }, { accountId: viewer.accountId, actorType: 'MEMBER' }, { reason: 'picker copy — nothing to remove' });
    if ((e as Error).message === 'no-clean-background') return { ok: false, reason: 'nochange' };
    throw e;
  }
  // its look is the cutout: no design on top, and a Studio recipe that says "as it is"
  const [design] = await db.select().from(storageObjects).where(eq(storageObjects.key, derivativeKey(assetId, 'design')));
  if (design) {
    await deleteObjectConfirmed(design.key);
    await db.delete(storageObjects).where(eq(storageObjects.id, design.id));
  }
  await db.update(assets).set({ studioDoc: { ...IDENTITY_GEOMETRY, objects: [] } }).where(eq(assets.id, assetId));
  return { ok: true, assetId };
}

/**
 * Tidy away a copy made for a Studio edit that was then never saved. Only the account that made it,
 * only within a few hours of making it, and never once it's in an order — otherwise it's a keepsake
 * like any other (deleted by its parent, as ever).
 */
export async function discardUnusedCopy(db: DbHandle, viewer: ViewerContext, assetId: string, now = new Date()): Promise<boolean> {
  if (!viewer.accountId) return false;
  const [a] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.uploaderAccountId, viewer.accountId), gt(assets.createdAt, new Date(now.getTime() - DISCARD_WINDOW_MS))));
  if (!a) return false;
  const [ordered] = await db.select({ id: orderItemArtwork.id }).from(orderItemArtwork).where(eq(orderItemArtwork.assetId, assetId)).limit(1);
  if (ordered) return false;
  await eraseAsset(db, { id: a.id, familyId: a.familyId }, { accountId: viewer.accountId, actorType: 'MEMBER' }, { reason: 'picker copy — studio left without saving' });
  return true;
}

/**
 * How a keepsake LOOKS — what the picker / keepsake box show and what a card or page prints from by
 * default: its Studio design when it has one, else the cutout a Studio save left as its design, else
 * the table-trimmed drawing, else the original. (A keepsake never saved in the Studio shows its
 * drawing — a cutout made on the create page and then put back is not its look.)
 */
export type LookObject = { id: string; key: string; sha256: string | null; kind: 'design' | 'cutout' | 'trimmed' | 'original' };
export async function keepsakeLooks(db: DbHandle, rows: { id: string; studioDoc: unknown }[]): Promise<Map<string, LookObject>> {
  const out = new Map<string, LookObject>();
  if (!rows.length) return out;
  const ids = rows.map((r) => r.id);
  const objs = await db
    .select({ id: storageObjects.id, key: storageObjects.key, sha256: storageObjects.sha256, assetId: storageObjects.assetId, objectClass: storageObjects.objectClass })
    .from(storageObjects)
    .where(inArray(storageObjects.assetId, ids));
  const byAsset = new Map<string, typeof objs>();
  for (const o of objs) byAsset.set(o.assetId, [...(byAsset.get(o.assetId) ?? []), o]);
  for (const r of rows) {
    const list = byAsset.get(r.id) ?? [];
    const find = (kind: 'design' | 'cutout' | 'trimmed') => list.find((o) => o.key === derivativeKey(r.id, kind));
    const original = list.find((o) => o.objectClass === 'ORIGINAL');
    const pick = (r.studioDoc ? (find('design') ? ['design', find('design')] : find('cutout') ? ['cutout', find('cutout')] : null) : null) ?? (find('trimmed') ? ['trimmed', find('trimmed')] : original ? ['original', original] : null);
    if (pick) {
      const [kind, o] = pick as [LookObject['kind'], (typeof objs)[number]];
      out.set(r.id, { id: o.id, key: o.key, sha256: o.sha256, kind });
    }
  }
  return out;
}
