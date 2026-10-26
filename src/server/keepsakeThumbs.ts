import 'server-only';
import { createHash } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { storageObjects } from '@/db/schema';
import { derivativeKey, getS3, presignDownload, putObject } from '@/storage';
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

/** Signed URLs for each asset's grid thumbnail (null where one couldn't be made — show the full picture). */
export async function keepsakeThumbUrls(db: DbHandle, assetIds: string[], ttlSec: number): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!assetIds.length) return out;
  const keys = assetIds.map((id) => derivativeKey(id, THUMB_KIND));
  const have = new Set((await db.select({ assetId: storageObjects.assetId }).from(storageObjects).where(inArray(storageObjects.key, keys))).map((r) => r.assetId));
  const missing = assetIds.filter((id) => !have.has(id));
  for (let i = 0; i < missing.length; i += MAKE_AT_ONCE) {
    await Promise.all(
      missing.slice(i, i + MAKE_AT_ONCE).map((id) =>
        makeThumb(db, id).then(
          () => have.add(id),
          () => undefined, // no thumbnail: the tile shows the full picture
        ),
      ),
    );
  }
  await Promise.all(assetIds.map(async (id) => out.set(id, have.has(id) ? await presignDownload(derivativeKey(id, THUMB_KIND), ttlSec) : null)));
  return out;
}

async function makeThumb(db: DbHandle, assetId: string): Promise<void> {
  const key = derivativeKey(assetId, THUMB_KIND);
  const buf = await sharp(await workingBytes(db, assetId)).rotate().resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  await putObject(key, buf, 'image/webp');
  const { bucket } = getS3();
  await db
    .insert(storageObjects)
    .values({ assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/webp', byteSize: buf.byteLength, sha256: createHash('sha256').update(buf).digest('hex'), exifStripped: true, writeOnce: false })
    .onConflictDoNothing({ target: storageObjects.key });
}
