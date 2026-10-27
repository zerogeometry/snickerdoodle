'use server';

import { getDb } from '@/db/client';
import { checkBundle } from '@/server/bundle';
import { getCurrentAccount, getUploadClaims } from '@/server/session';

/**
 * "add to basket" on the Christmas family bundle: every chosen drawing is authz-checked server-side
 * (src/server/bundle.ts) and the bundle is priced from what it carries. The client's figure is never
 * used — the basket shows the server's, and the order re-checks + re-prices it all again.
 */
export async function checkBundleAction(bundle: unknown): Promise<{ ok: true; pricePence: number } | { ok: false; reason: 'invalid' | 'not-allowed' | 'error' }> {
  try {
    const account = await getCurrentAccount();
    const res = await checkBundle(getDb(), { accountId: account?.id ?? null, uploadClaims: await getUploadClaims(), bundle });
    return res.ok ? { ok: true, pricePence: res.pricePence } : res;
  } catch {
    return { ok: false, reason: 'error' };
  }
}
