'use server';

import { getDb } from '@/db/client';
import { getCurrentAccount } from '@/server/session';
import { submitSupportRequest } from '@/server/support';
import { clientIp, LIMITS, rateLimit } from '@/server/rateLimit';

/**
 * The help form (/help). Anyone can write — signed in or not. `website` is a honeypot: people never
 * see it, bots fill it in; those are quietly accepted and dropped so a bot learns nothing.
 */
export async function submitSupportAction(input: {
  topic: string;
  email: string;
  name?: string;
  orderRef?: string;
  message: string;
  website?: string;
}): Promise<{ ok: boolean; ref?: string; reason?: 'invalid' | 'too-many' }> {
  if (input?.website) return { ok: true };
  if (!(await rateLimit(getDb(), { ...LIMITS.supportPerIp, caller: await clientIp() })).ok) return { ok: false, reason: 'too-many' };
  const account = await getCurrentAccount();
  try {
    const res = await submitSupportRequest(getDb(), {
      topic: String(input?.topic ?? ''),
      email: String(input?.email ?? ''),
      name: String(input?.name ?? ''),
      orderRef: String(input?.orderRef ?? ''),
      message: String(input?.message ?? ''),
      accountId: account?.id ?? null,
    });
    return res.ok ? { ok: true, ref: res.ref } : { ok: false, reason: res.reason };
  } catch {
    return { ok: false };
  }
}
