'use server';

import { and, desc, eq } from 'drizzle-orm';
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
import { copyKeepsake, copyWithoutBackground, discardUnusedCopy, keepsakeLooks } from '@/server/keepsakeCopy';
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

  // each keepsake's LOOK — its Studio design if it has one, else its drawing (src/server/keepsakeCopy.ts)
  const visible = pickableKeepsakes(rows, viewer);
  const looks = await keepsakeLooks(db, visible.map(({ row }) => ({ id: row.asset.id, studioDoc: row.asset.studioDoc })));
  // the grid's small copies (made once per look) — only for the cleared keepsakes
  const thumbs = await keepsakeThumbUrls(db, visible.map(({ row }) => ({ assetId: row.asset.id, look: looks.get(row.asset.id) ?? null })), 600);

  // Authz FIRST, then mint — a URL is never minted for a keepsake the viewer can't see.
  return Promise.all(
    visible.map(async ({ row, printable }) => {
      const look = looks.get(row.asset.id);
      // a Studio design is judged on its drawing's real pixels (src/server/print/sourceDims.ts)
      const designPx = (row.asset.studioDoc as { designPx?: { width: number; height: number; sha256: string } } | null)?.designPx;
      const px = look?.kind === 'design' && designPx && look.sha256 === designPx.sha256 ? { width: designPx.width, height: designPx.height } : undefined;
      return {
        thumbUrl: thumbs.get(row.asset.id) ?? null,
        id: row.asset.id,
        imageUrl: look ? await presignDownload(look.key, 600) : null,
        createdAtISO: row.asset.createdAt.toISOString(),
        childFirstName: row.asset.childSubjectId ? (nameOf.get(row.asset.childSubjectId) ?? null) : null,
        printable,
        ...(look && look.kind !== 'original' ? { sourceObjectId: look.id } : {}),
        ...(px ? { px } : {}),
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
 * Edit a keepsake from a drawing picker (or the Create screen) → a NEW keepsake (founder, 27 Oct):
 * the copy is made here, and the edit happens on it — the keepsake it came from is never touched.
 * `removeBackground`: the copy comes back with the background already lifted.
 */
export async function copyKeepsakeAction(input: { assetId: string; removeBackground?: boolean }): Promise<{ ok: true; assetId: string } | { ok: false; reason?: 'nochange' | 'signed-out' }> {
  try {
    const account = await getCurrentAccount();
    if (!account) return { ok: false, reason: 'signed-out' };
    const db = getDb();
    const assetId = String(input?.assetId ?? '');
    const [a] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
    if (!a?.familyId) return { ok: false };
    const viewer = await resolveViewerContext(db, account.id, a.familyId);
    if (input.removeBackground) {
      const r = await copyWithoutBackground(db, viewer, assetId, { keepEnclosedPaper: true });
      return r.ok ? r : { ok: false, reason: r.reason };
    }
    return { ok: true, ...(await copyKeepsake(db, viewer, assetId)) };
  } catch {
    return { ok: false };
  }
}

/** A copy made for a Studio edit that was then left without saving — tidied away (only its maker, only while fresh). */
export async function discardCopyAction(input: { assetId: string }): Promise<{ ok: boolean }> {
  try {
    const account = await getCurrentAccount();
    if (!account) return { ok: false };
    const db = getDb();
    const assetId = String(input?.assetId ?? '');
    const [a] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
    if (!a?.familyId) return { ok: false };
    return { ok: await discardUnusedCopy(db, await resolveViewerContext(db, account.id, a.familyId), assetId) };
  } catch {
    return { ok: false };
  }
}
