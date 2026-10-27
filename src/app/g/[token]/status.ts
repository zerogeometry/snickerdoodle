import { getDb } from '@/db/client';
import { getGiftLink, type GiftLinkView } from '@/server/giftLinks';

/**
 * The HTTP status a gift-link page answers with (CLAUDE.md: "deleted source → 410"). The page
 * still renders its friendly card for every state — this only makes the status honest, so a
 * crawler, link-preview bot or cache treats a dead link as dead:
 *   active → 200 · revoked / expired / gone (a keepsake deleted or pulled back) → 410 · unknown token → 404.
 * Resolved from the same getGiftLink the page renders from, so the two can never disagree.
 * Set by src/middleware.ts (only middleware can set an App Router page's status).
 */
export function statusForGiftLinkState(state: GiftLinkView['state']): 200 | 404 | 410 {
  if (state === 'active') return 200;
  if (state === 'not-found') return 404;
  return 410;
}

/** Gift-link tokens are base64url (see createGiftLink); anything else can't be one. */
export const GIFT_LINK_PATH = /^\/g\/([A-Za-z0-9_-]{8,128})\/?$/;

export async function giftLinkHttpStatus(token: string): Promise<200 | 404 | 410> {
  return statusForGiftLinkState((await getGiftLink(getDb(), token)).state);
}
