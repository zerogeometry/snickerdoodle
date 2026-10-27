'use server';

import { getDb } from '@/db/client';
import { getCurrentAccount } from '@/server/session';
import { reportGiftLink, reportKeepsake } from '@/server/contentReports';
import { resolveViewerContext } from '@/server/assets';
import { assets } from '@/db/schema';
import { eq } from 'drizzle-orm';
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

/** "Report this keepsake" — someone in the family, about a keepsake they can see but don't manage. */
export async function reportKeepsakeAction(input: { assetId: string; reason: string; note?: string }): Promise<{ ok: boolean; reason?: 'invalid' | 'too-many' | 'signed-out' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: 'signed-out' };
  const db = getDb();
  if (!(await rateLimit(db, { ...LIMITS.reportPerIp, caller: await clientIp() })).ok) return { ok: false, reason: 'too-many' };
  try {
    const assetId = String(input?.assetId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(assetId)) return { ok: false, reason: 'invalid' };
    const [a] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, assetId));
    if (!a?.familyId) return { ok: false, reason: 'invalid' };
    const viewer = await resolveViewerContext(db, account.id, a.familyId);
    return await reportKeepsake(db, viewer, { assetId, reason: String(input?.reason ?? ''), note: String(input?.note ?? '') });
  } catch {
    return { ok: false };
  }
}
