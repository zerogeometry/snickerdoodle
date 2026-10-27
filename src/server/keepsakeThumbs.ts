import 'server-only';
import { createHash } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { storageObjects } from '@/db/schema';
import { derivativeKey, getObjectBytes, getS3, presignDownload, putObject } from '@/storage';
import type { DbHandle } from './db';
import { workingBytes } from './magic';

/**
 * Small copies of keepsakes for GRIDS — the keepsake home, the calendar / card-pack picker (founder,
 * 26 Oct: "the more items I upload, the slower the app gets" — every tile downloaded the full
 * multi-MB photo). A 400px WebP of the working drawing (the table-trimmed one), made once the first
 * time it's needed and stored as a DERIVATIVE under the asset, so retention + deletion cover it.
 *
 * The CALLER has already cleared the viewer to see every asset passed (authz first, then mint).
 */
const THUMB_KIND = 'picker-thumb';
const THUMB_EDGE = 400;
/** at most this many made at once (a first visit to a big keepsake box mustn't swamp the box) */
const MAKE_AT_ONCE = 2;

/** A keepsake for the grid, with its LOOK when it's a Studio design / cutout (src/server/keepsakeCopy.ts). */
export type ThumbItem = string | { assetId: string; look?: { key: string; sha256: string | null; kind: string } | null };

/** The thumbnail's key: one per edited look (so a new edit gets a new thumbnail), else one per drawing. */
function thumbKeyOf(item: { assetId: string; look?: { sha256: string | null; kind: string } | null }): string {
  const l = item.look;
  return l && (l.kind === 'design' || l.kind === 'cutout') && l.sha256 ? derivativeKey(item.assetId, `look-thumb-${l.sha256.slice(0, 12)}`) : derivativeKey(item.assetId, THUMB_KIND);
}

/** Signed URLs for each asset's grid thumbnail (null where one couldn't be made — show the full picture). */
export async function keepsakeThumbUrls(db: DbHandle, input: ThumbItem[], ttlSec: number): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!input.length) return out;
  const items = input.map((i) => (typeof i === 'string' ? { assetId: i, look: null } : i));
  const keyOf = new Map(items.map((i) => [i.assetId, thumbKeyOf(i)]));
  const have = new Set((await db.select({ key: storageObjects.key }).from(storageObjects).where(inArray(storageObjects.key, [...keyOf.values()]))).map((r) => r.key));
  const missing = items.filter((i) => !have.has(keyOf.get(i.assetId)!));
  for (let n = 0; n < missing.length; n += MAKE_AT_ONCE) {
    await Promise.all(
      missing.slice(n, n + MAKE_AT_ONCE).map((i) =>
        makeThumb(db, i.assetId, keyOf.get(i.assetId)!, i.look && keyOf.get(i.assetId) !== derivativeKey(i.assetId, THUMB_KIND) ? i.look.key : null).then(
          () => have.add(keyOf.get(i.assetId)!),
          () => undefined, // no thumbnail: the tile shows the full picture
        ),
      ),
    );
  }
  await Promise.all(items.map(async (i) => out.set(i.assetId, have.has(keyOf.get(i.assetId)!) ? await presignDownload(keyOf.get(i.assetId)!, ttlSec) : null)));
  return out;
}

async function makeThumb(db: DbHandle, assetId: string, key: string, fromKey: string | null): Promise<void> {
  const buf = await sharp(fromKey ? await getObjectBytes(fromKey) : await workingBytes(db, assetId)).rotate().resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  await putObject(key, buf, 'image/webp');
  const { bucket } = getS3();
  await db
    .insert(storageObjects)
    .values({ assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/webp', byteSize: buf.byteLength, sha256: createHash('sha256').update(buf).digest('hex'), exifStripped: true, writeOnce: false })
    .onConflictDoNothing({ target: storageObjects.key });
}
