'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { assets, auditRecords } from '@/db/schema';
import { getDb } from '@/db/client';
import { deleteAsset, resolveViewerContext } from '@/server/assets';
import { loadHome } from '@/server/home';
import { ensureHomeFamily } from '@/server/onboarding';
import { getOrdersForAccount } from '@/server/orders';
import { getCurrentAccount } from '@/server/session';

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

  const orders = await getOrdersForAccount(getDb(), account.id);

  const data = {
    exportedAtISO: nowISO,
    account: home.account,
    family: { id: home.familyId, name: home.familyName, members: home.members, children: home.children },
    keepsakes: home.keepsakes,
    orders,
  };
  return { ok: true, filename: `snickerdoodle-your-data.json`, json: JSON.stringify(data, null, 2) };
}

/**
 * Erase everything the account controls — every keepsake the controlling parent
 * holds is really deleted (bytes confirmed-gone + DB row), audited per item, and an
 * ACCOUNT_CLOSED record is written. NN8 + children's-data rules: a child's data is
 * removable on demand. (The login record + financial order history are retained per
 * the legal-basis schedule with the child image already cascaded out of any order.)
 */
export async function deleteAllMyKeepsakesAction(nowISO: string): Promise<{ ok: boolean; deleted: number }> {
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

  await db.insert(auditRecords).values({
    familyId,
    actorAccountId: account.id,
    actorType: 'MEMBER',
    event: 'ACCOUNT_CLOSED',
    targetType: 'account',
    targetId: account.id,
    metadata: { keepsakesDeleted: deleted, atISO: nowISO },
  });

  revalidatePath('/home');
  return { ok: true, deleted };
}
