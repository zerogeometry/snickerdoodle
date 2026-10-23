'use server';

import { getDb } from '@/db/client';
import { getCurrentAccount } from '@/server/session';
import { reportGiftLink } from '@/server/contentReports';
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
