'use server';

import { and, desc, eq } from 'drizzle-orm';
import { assets, children, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { presignDownload } from '@/storage';
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

  // Authz FIRST, then mint — a URL is never minted for a keepsake the viewer can't see.
  return Promise.all(
    pickableKeepsakes(rows, viewer).map(async ({ row, printable }) => ({
      id: row.asset.id,
      imageUrl: row.key ? await presignDownload(row.key, 600) : null,
      createdAtISO: row.asset.createdAt.toISOString(),
      childFirstName: row.asset.childSubjectId ? (nameOf.get(row.asset.childSubjectId) ?? null) : null,
      printable,
    })),
  );
}
