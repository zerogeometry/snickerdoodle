'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { assets } from '@/db/schema';
import { getDb } from '@/db/client';
import { deleteAsset, resolveViewerContext } from '@/server/assets';
import { loadHome } from '@/server/home';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount } from '@/server/session';
import { closeAccount, closurePreview, type ClosurePreview } from '@/server/accountClosure';
import { collectAccountData } from '@/server/exportData';

/**
 * Download-your-data (a portable subject-access export). Returns everything we hold
 * ABOUT the signed-in account as JSON: their profile, family + circle, the keepsakes
 * (with short-lived signed image URLs) and their orders. Authz is enforced by the
 * underlying loaders (loadHome resolves the viewer + filters via the central policy);
 * a guest gets nothing. The client turns this into a downloaded file.
 */
export async function exportMyDataAction(nowISO: string): Promise<{ ok: boolean; filename?: string; json?: string }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };

  const home = await loadHome();
  if (!home) return { ok: false };

  const everything = await collectAccountData(getDb(), account.id);

  const data = {
    exportedAtISO: nowISO,
    about:
      'Everything Snickerdoodle holds about you. Keepsake image links work for a few minutes after download — save the images you want straight away.',
    // what you see in your keepsake home (with short-lived image links)
    home: {
      family: { id: home.familyId, name: home.familyName, members: home.members, children: home.children },
      keepsakes: home.keepsakes,
    },
    ...everything,
  };
  return { ok: true, filename: `snickerdoodle-your-data.json`, json: JSON.stringify(data, null, 2) };
}

/**
 * Erase everything the account controls — every keepsake the controlling parent
 * holds is really deleted (bytes confirmed-gone + DB row), audited per item. (Closing the
 * whole account is closeMyAccountAction.) NN8 + children's-data rules: a child's data is
 * removable on demand. (The login record + financial order history are retained per
 * the legal-basis schedule with the child image already cascaded out of any order.)
 */
export async function deleteAllMyKeepsakesAction(_nowISO: string): Promise<{ ok: boolean; deleted: number }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, deleted: 0 };

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);
  const viewer = await resolveViewerContext(db, account.id, familyId);

  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.familyId, familyId), eq(assets.controllerAccountId, account.id)));

  let deleted = 0;
  for (const r of rows) {
    try {
      await deleteAsset(db, r.id, viewer);
      deleted++;
    } catch {
      // skip any the viewer can't delete; the rest still go
    }
  }

  // (each keepsake is audited as ASSET_DELETED by deleteAsset — this is not an account closure)

  revalidatePath('/home');
  return { ok: true, deleted };
}

/**
 * Close the account for good (right to erasure). Everything the account owns or controls is
 * erased — see closeAccount for exactly what goes and what (anonymised) money records stay.
 * Their sessions are deleted, so they're signed out everywhere on the next request.
 */
export async function closeMyAccountAction(
  handOver?: { familyId: string; newOwnerAccountId: string } | null,
): Promise<{ ok: boolean; reason?: 'order-in-flight' | 'bad-handover' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const res = await closeAccount(getDb(), account.id, new Date(), {
    handOver: handOver ? { familyId: String(handOver.familyId), newOwnerAccountId: String(handOver.newOwnerAccountId) } : null,
  });
  if (!res.ok) return res.reason === 'not-found' ? { ok: false } : { ok: false, reason: res.reason };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** What closing would do for the signed-in account — shown before they confirm. */
export async function closurePreviewAction(): Promise<ClosurePreview | null> {
  const account = await getCurrentAccount();
  if (!account) return null;
  return closurePreview(getDb(), account.id);
}
