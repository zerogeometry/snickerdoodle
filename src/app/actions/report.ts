'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { assets } from '@/db/schema';
import { getDb } from '@/db/client';
import { resolveViewerContext } from '@/server/assets';
import { isReportReason, reportAsMember, reportViaGiftLink } from '@/server/reports';
import { getCurrentAccount } from '@/server/session';
import { allow, allowVisitor } from '@/server/rateLimit';

/**
 * One-tap report (D8). Both actions answer `{ ok: true }` for anything well-formed — whether or
 * not the link/keepsake qualified — so a report can never be used to probe tokens or ids. Only a
 * malformed reason is refused.
 */
export async function reportGiftItemAction(token: string, assetId: string, reason: string): Promise<{ ok: boolean }> {
  if (!isReportReason(reason) || typeof token !== 'string' || typeof assetId !== 'string') return { ok: false };
  if (!(await allowVisitor('report'))) return { ok: true }; // same friendly reply; nothing recorded
  const account = await getCurrentAccount();
  try {
    await reportViaGiftLink(getDb(), token, assetId, reason, account?.id ?? null);
  } catch {
    // swallowed on purpose: same answer either way (see above)
  }
  return { ok: true };
}

export async function reportKeepsakeAction(assetId: string, reason: string): Promise<{ ok: boolean }> {
  if (!isReportReason(reason) || typeof assetId !== 'string') return { ok: false };
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  if (!allow('report', account.id)) return { ok: true };
  const db = getDb();
  try {
    const [asset] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
    if (!asset) return { ok: true };
    await reportAsMember(db, await resolveViewerContext(db, account.id, asset.familyId), assetId, reason);
  } catch {
    return { ok: true }; // denied ≡ not found ≡ the same friendly reply
  }
  revalidatePath('/home');
  return { ok: true };
}
