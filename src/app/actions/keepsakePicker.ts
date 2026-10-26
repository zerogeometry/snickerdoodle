'use server';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { assets, children, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { createHash } from 'node:crypto';
import { derivativeKey, getS3, presignDownload, putObject } from '@/storage';
import sharp from 'sharp';
import { getViewableAssetOrThrow, resolveAssetViewer } from '@/server/assets';
import { getUploadClaims } from '@/server/session';
import { workingBytes } from '@/server/magic';
import { resolveViewerContext } from '@/server/assets';
import { pickableKeepsakes, type PickerKeepsake } from '@/server/keepsakePicker';
import { resolveHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';

/**
 * The drawings the signed-in parent can put on a card pack — their keepsake box, authz-gated with
 * short-lived signed URLs. `signedIn: false` for a guest (who can still use the drawing in progress).
 */
export async function keepsakePickerAction(): Promise<{ ok: true; signedIn: boolean; keepsakes: PickerKeepsake[] } | { ok: false }> {
  try {
    const keepsakes = await loadKeepsakePicker();
    return { ok: true, signedIn: keepsakes !== null, keepsakes: keepsakes ?? [] };
  } catch {
    return { ok: false };
  }
}

/** The signed-in account's pickable keepsakes — null for a guest (no keepsake box yet). */
async function loadKeepsakePicker(): Promise<PickerKeepsake[] | null> {
  const account = await getCurrentAccount();
  if (!account) return null;
  const db = getDb();
  const familyId = await resolveHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);

  const rows = await db
    .select({ asset: assets, key: storageObjects.key })
    .from(assets)
    .leftJoin(storageObjects, and(eq(storageObjects.assetId, assets.id), eq(storageObjects.objectClass, 'ORIGINAL')))
    .where(and(eq(assets.familyId, familyId), eq(assets.keptInHome, true)))
    .orderBy(desc(assets.createdAt));

  const kids = await db.select({ id: children.id, firstName: children.firstName }).from(children).where(eq(children.familyId, familyId));
  const nameOf = new Map(kids.map((c) => [c.id, c.firstName]));

  // the table-trimmed copies (the working drawing — src/server/magic.ts) of these keepsakes
  const visible = pickableKeepsakes(rows, viewer);
  const trimKeys = visible.map(({ row }) => derivativeKey(row.asset.id, 'trimmed'));
  const trims = trimKeys.length
    ? await db.select({ id: storageObjects.id, key: storageObjects.key, assetId: storageObjects.assetId }).from(storageObjects).where(inArray(storageObjects.key, trimKeys))
    : [];
  const trimOf = new Map(trims.map((t) => [t.assetId, t]));

  // the picker's small copies (made once, the first time one is needed)
  const thumbKeys = visible.map(({ row }) => derivativeKey(row.asset.id, 'picker-thumb'));
  const thumbs = thumbKeys.length ? await db.select({ key: storageObjects.key, assetId: storageObjects.assetId }).from(storageObjects).where(inArray(storageObjects.key, thumbKeys)) : [];
  const hasThumb = new Set(thumbs.map((t) => t.assetId));

  // Authz FIRST, then mint — a URL is never minted for a keepsake the viewer can't see.
  return Promise.all(
    visible.map(async ({ row, printable }) => {
      const trim = trimOf.get(row.asset.id);
      const key = trim?.key ?? row.key;
      const thumbKey = hasThumb.has(row.asset.id) ? derivativeKey(row.asset.id, 'picker-thumb') : await makePickerThumb(db, row.asset.id).catch(() => null);
      return {
        thumbUrl: thumbKey ? await presignDownload(thumbKey, 600) : null,
        id: row.asset.id,
        imageUrl: key ? await presignDownload(key, 600) : null,
        createdAtISO: row.asset.createdAt.toISOString(),
        childFirstName: row.asset.childSubjectId ? (nameOf.get(row.asset.childSubjectId) ?? null) : null,
        printable,
        ...(trim ? { sourceObjectId: trim.id } : {}),
      };
    }),
  );
}

/**
 * Open a keepsake in the Studio from the calendar / card-pack picker (founder, 26 Oct): its working
 * drawing (the table-trimmed copy when there is one) as the page's own copy, through the same gate as
 * every read — a member of its family, or the holder of its upload claim.
 */
export async function keepsakeForStudioAction(input: { assetId: string }): Promise<
  { ok: true; dataUrl: string; aspect: number; trim?: { url: string; sourceObjectId: string } } | { ok: false }
> {
  try {
    const db = getDb();
    const account = await getCurrentAccount();
    const viewer = await resolveAssetViewer(db, String(input.assetId), account?.id ?? null, await getUploadClaims());
    await getViewableAssetOrThrow(db, String(input.assetId), viewer); // ← the gate
    const img = sharp(await workingBytes(db, String(input.assetId))).rotate();
    const meta = await img.metadata();
    const jpeg = await img.resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const [trim] = await db.select({ id: storageObjects.id, key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.key, derivativeKey(String(input.assetId), 'trimmed')));
    return {
      ok: true,
      dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      aspect: (meta.width ?? 1) / (meta.height ?? 1),
      ...(trim ? { trim: { url: await presignDownload(trim.key, 600), sourceObjectId: trim.id } } : {}),
    };
  } catch {
    return { ok: false };
  }
}

/**
 * A keepsake's small copy for the picker grid (founder, 26 Oct: "the more items I upload, the slower the
 * app gets" — every tile downloaded the full multi-MB photo). 400px WebP of its working drawing (the
 * table-trimmed one), a DERIVATIVE under the asset (retention + deletion cover it). Called only for a
 * keepsake the viewer was just cleared to see (loadKeepsakePicker filters through the gate first).
 */
async function makePickerThumb(db: ReturnType<typeof getDb>, assetId: string): Promise<string> {
  const key = derivativeKey(assetId, 'picker-thumb');
  const buf = await sharp(await workingBytes(db, assetId)).rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  await putObject(key, buf, 'image/webp');
  const { bucket } = getS3();
  await db
    .insert(storageObjects)
    .values({ assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/webp', byteSize: buf.byteLength, sha256: createHash('sha256').update(buf).digest('hex'), exifStripped: true, writeOnce: false })
    .onConflictDoNothing({ target: storageObjects.key });
  return key;
}
