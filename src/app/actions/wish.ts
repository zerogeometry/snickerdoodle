'use server';

import { getDb } from '@/db/client';
import { adoptEphemeralDraft, resolveViewerContext } from '@/server/assets';
import { createGiftLink } from '@/server/giftLinks';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount, getUploadClaims } from '@/server/session';

/**
 * Share a Wish from the basket. For a signed-in family owner this:
 *   1. KEEPS each basket creation into the family — adopts the ephemeral draft so
 *      it becomes a real, kept keepsake (FAMILY by default, off the retention
 *      clock). This is the keepsake-save folded into Share a Wish.
 *   2. Mints ONE shareable gift link from those kept keepsakes.
 *
 * A guest is told to sign up first (needsAuth) — the basket survives the magic-link
 * round-trip (sessionStorage), so the caller re-runs this on return. Authz, the
 * upload-claim check, and the content-safety (CLEAR-only) gate all live in the
 * server modules this composes; nothing here trusts the client for ownership.
 */
export async function createWishAction(input: {
  assetIds: string[];
  title?: string;
}): Promise<{ ok: boolean; needsAuth?: boolean; url?: string }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };

  const ids = [...new Set((input.assetIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: false };

  const claims = await getUploadClaims();
  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);

  // Keep each creation into the family. Idempotent: an already-kept asset the
  // owner holds is a no-op; a draft we can't claim is skipped, and createGiftLink
  // then filters to only viewable + kept + content-cleared keepsakes.
  for (const assetId of ids) {
    try {
      await adoptEphemeralDraft(db, account.id, familyId, assetId, claims);
    } catch {
      // not ours to keep / already gone — leave it out of the link
    }
  }

  const viewer = await resolveViewerContext(db, account.id, familyId);
  try {
    const { token } = await createGiftLink(db, viewer, {
      familyId,
      assetIds: ids,
      title: input.title ?? null,
      invite: null,
    });
    return { ok: true, url: `/g/${token}` };
  } catch {
    return { ok: false };
  }
}
