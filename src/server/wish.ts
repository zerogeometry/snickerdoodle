import { adoptEphemeralDraft, resolveViewerContext } from '@/server/assets';
import { createGiftLink } from '@/server/giftLinks';
import { ensureHomeFamily } from '@/server/onboarding';
import { screenChildFirstName } from '@/server/textSafety';
import type { DbHandle } from './db';

export interface MintWishInput {
  assetIds: string[];
  /** The child this wish is FOR — first name only; screened + turned into the title here. */
  subject?: string | null;
}

/**
 * The "Share a Wish" core: KEEP each basket draft into the caller's home family
 * (adopt the ephemeral draft → kept, FAMILY-default, off the retention clock) then
 * mint ONE gift link from them. Drafts the caller can't claim, or that are BLOCKED,
 * are skipped (adoption throws and is swallowed); createGiftLink then snapshots only
 * the viewable + kept + content-CLEAR keepsakes.
 *
 * The subject (child first name) is SCREENED server-side — first-name-only, no
 * surname, no abuse (children's-data rules) — and only then composed into the gift
 * title here; a bad name fails fast (reason: 'name') BEFORE anything is kept.
 *
 * Pure server core — takes the db, the resolved account, and the held upload claims
 * as arguments — so it's exercisable in integration tests. The 'use server' action
 * (src/app/actions/wish.ts) is the thin shell that wires session + cookies to this.
 */
export async function mintWish(
  db: DbHandle,
  account: { id: string; name: string | null },
  uploadClaims: string[],
  input: MintWishInput,
): Promise<{ ok: boolean; url?: string; reason?: 'name' }> {
  const ids = [...new Set((input.assetIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: false };

  // Screen the child's name BEFORE keeping anything — never store an unscreened
  // subject, and never silently strip a surname.
  const screened = screenChildFirstName(input.subject);
  if (!screened.ok) return { ok: false, reason: 'name' };
  const title = screened.value ? `${screened.value}’s wishlist` : null;

  const familyId = await ensureHomeFamily(db, account.id, account.name);

  // Keep each creation. Idempotent for an already-kept asset the owner holds; a
  // draft we can't claim (wrong claim / BLOCKED) throws and is left out of the link.
  for (const assetId of ids) {
    try {
      await adoptEphemeralDraft(db, account.id, familyId, assetId, uploadClaims);
    } catch {
      // not ours to keep / blocked / already gone
    }
  }

  const viewer = await resolveViewerContext(db, account.id, familyId);
  try {
    const { token } = await createGiftLink(db, viewer, {
      familyId,
      assetIds: ids,
      title,
      invite: null,
    });
    return { ok: true, url: `/g/${token}` };
  } catch {
    return { ok: false };
  }
}
