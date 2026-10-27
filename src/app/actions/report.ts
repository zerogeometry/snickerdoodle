'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AuthzError } from '@/authz';
import { assets } from '@/db/schema';
import { getDb } from '@/db/client';
import { resolveViewerContext } from '@/server/assets';
import { getCurrentAccount } from '@/server/session';
import { reportGiftLink, reportKeepsakeFromHome } from '@/server/contentReports';
import { clientIp, LIMITS, rateLimit } from '@/server/rateLimit';

/** "Report this" on a gift link — anyone holding the link can use it, signed in or not. */
export async function reportGiftLinkAction(input: { token: string; reason: string; note?: string; email?: string; website?: string }): Promise<{ ok: boolean; reason?: 'invalid' | 'too-many' }> {
  if (input?.website) return { ok: true }; // honeypot
  if (!(await rateLimit(getDb(), { ...LIMITS.reportPerIp, caller: await clientIp() })).ok) return { ok: false, reason: 'too-many' };
  const account = await getCurrentAccount();
  try {
    return await reportGiftLink(getDb(), {
      token: String(input?.token ?? ''),
      reason: String(input?.reason ?? ''),
      note: String(input?.note ?? ''),
      email: String(input?.email ?? ''),
      accountId: account?.id ?? null,
    });
  } catch {
    return { ok: false };
  }
}

/**
 * "Report this keepsake" from the Keepsake Home — a signed-in family member, on a keepsake they're
 * shown. The family scope + view check is resolved server-side (never trusted from the client); a
 * keepsake they can't see gets the same friendly answer as one they can, so it's no probe for ids.
 */
export async function reportKeepsakeAction(input: { assetId: string; reason: string; note?: string; email?: string; website?: string }): Promise<{ ok: boolean; reason?: 'invalid' | 'too-many' }> {
  if (input?.website) return { ok: true }; // honeypot
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const db = getDb();
  if (!(await rateLimit(db, { ...LIMITS.reportPerAccount, caller: account.id })).ok) return { ok: false, reason: 'too-many' };
  const assetId = String(input?.assetId ?? '');
  try {
    const [asset] = /^[0-9a-f-]{36}$/i.test(assetId) ? await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId)) : [];
    const viewer = await resolveViewerContext(db, account.id, asset?.familyId ?? null);
    const res = await reportKeepsakeFromHome(db, viewer, { assetId, reason: String(input?.reason ?? ''), note: String(input?.note ?? ''), email: String(input?.email ?? '') });
    if (res.ok) revalidatePath('/home');
    return res;
  } catch (e) {
    if (e instanceof AuthzError) return { ok: true }; // denied ≡ not found ≡ the same friendly reply
    return { ok: false };
  }
}
