'use server';

import { getDb } from '@/db/client';
import { getCurrentAccount } from '@/server/session';
import { submitComplaint } from '@/server/rights';

/**
 * The data-protection complaint form (/trust/data-complaint). Anyone can complain — signed in or
 * not. `website` is a honeypot: people never see it, bots fill it in; those are quietly accepted
 * and dropped so a bot learns nothing.
 */
export async function submitComplaintAction(input: {
  name: string;
  email: string;
  message: string;
  website?: string;
}): Promise<{ ok: boolean; ref?: string; reason?: 'invalid' | 'too-many' }> {
  if (input?.website) return { ok: true };
  const account = await getCurrentAccount();
  try {
    const res = await submitComplaint(getDb(), {
      name: String(input?.name ?? ''),
      email: String(input?.email ?? ''),
      message: String(input?.message ?? ''),
      accountId: account?.id ?? null,
    });
    return res.ok ? { ok: true, ref: res.ref } : { ok: false, reason: res.reason };
  } catch {
    return { ok: false };
  }
}
