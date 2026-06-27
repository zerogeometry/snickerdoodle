'use server';

import { getDb } from '@/db/client';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { mintWish } from '@/server/wish';

/**
 * Share a Wish from the basket. KEEPS each basket creation into the family (adopts
 * the ephemeral draft → kept, FAMILY by default, off the retention clock) and mints
 * ONE shareable gift link from them. A guest is told to sign up first (needsAuth) —
 * the basket survives the magic-link round-trip, so the caller re-runs this on return.
 *
 * Thin shell over the unit-tested src/server/wish core: it only resolves the session
 * + held upload claims. Authz, the upload-claim check, and the content-safety
 * (CLEAR-only) gate all live in the server modules mintWish composes; nothing here
 * trusts the client for ownership.
 */
export async function createWishAction(input: {
  assetIds: string[];
  subject?: string;
}): Promise<{ ok: boolean; needsAuth?: boolean; url?: string; reason?: 'name' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };

  const claims = await getUploadClaims();
  const db = getDb();
  return mintWish(db, account, claims, input);
}
