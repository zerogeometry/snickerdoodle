'use server';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { assets, children, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { derivativeKey, presignDownload } from '@/storage';
import sharp from 'sharp';
import { getViewableAssetOrThrow, resolveAssetViewer } from '@/server/assets';
import { getUploadClaims } from '@/server/session';
import { workingBytes } from '@/server/magic';
import { resolveViewerContext } from '@/server/assets';
import { pickableKeepsakes, type PickerKeepsake } from '@/server/keepsakePicker';
import { keepsakeThumbUrls } from '@/server/keepsakeThumbs';
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

  // the grid's small copies (made once, the first time one is needed) — only for the cleared keepsakes
  const thumbs = await keepsakeThumbUrls(db, visible.map(({ row }) => row.asset.id), 600);

  // Authz FIRST, then mint — a URL is never minted for a keepsake the viewer can't see.
  return Promise.all(
    visible.map(async ({ row, printable }) => {
      const trim = trimOf.get(row.asset.id);
      const key = trim?.key ?? row.key;
      return {
        thumbUrl: thumbs.get(row.asset.id) ?? null,
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

