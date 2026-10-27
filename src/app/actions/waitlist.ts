'use server';

import { getDb } from '@/db/client';
import { allowVisitor } from '@/server/rateLimit';
import { confirmWaitlist, joinWaitlist } from '@/server/waitlist';
import type { WaitlistJoinReason } from '@/lib/waitlist';

/**
 * "founding families" sign-up. The answer never says whether an address was already on the list.
 * `website` is the honeypot (hidden from people; bots fill it in).
 */
export async function joinWaitlistAction(input: {
  email: string;
  consent: boolean;
  website?: string;
}): Promise<{ ok: true } | { ok: false; reason: WaitlistJoinReason }> {
  if (!(await allowVisitor('waitlist'))) return { ok: false, reason: 'too-many' };
  try {
    const res = await joinWaitlist(getDb(), { email: input?.email, consent: input?.consent, website: input?.website });
    return res.ok ? { ok: true } : res;
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** The double-opt-in tap on /waitlist/confirm (a button, so a mail scanner's prefetch never consents). */
export async function confirmWaitlistAction(token: string): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'expired' | 'error' }> {
  try {
    const res = await confirmWaitlist(getDb(), token);
    return res.ok ? { ok: true } : res;
  } catch {
    return { ok: false, reason: 'error' };
  }
}
