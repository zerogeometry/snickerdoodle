import { and, eq, inArray } from 'drizzle-orm';
import { assets } from '@/db/schema';
import { adoptEphemeralDraft, changeAssetVisibility, resolveViewerContext } from '@/server/assets';
import { resolveChildSubject } from '@/server/children';
import { createGiftLink, NothingToShowError, type GiftLineInput } from '@/server/giftLinks';
import { CIRCLES, type Circle } from '@/domain/types';
import { effectiveVisibility, isNarrower, planVisibilityChange } from '@/authz';
import { assetRefOf } from './assetRef';
import { ensureHomeFamily } from '@/server/onboarding';
import { screenChildFirstName } from '@/server/textSafety';
import type { DbHandle } from './db';

export interface MintWishInput {
  assetIds: string[];
  /** The basket's lines — each keepsake on the product the child chose (variant, placement,
   * cutout, back, base colour). Untrusted: createGiftLink re-checks every one. Without them (an old
   * caller) the keepsakes are offered as the default product. */
  lines?: GiftLineInput[];
  /** The child this wish is FOR — first name only; screened + turned into the title here. */
  subject?: string | null;
  /** "who's it for?" (D27, founder answer C): we can't know who opens a shared link, so the parent picks the circle
   * it shows for. Extended unless they say otherwise. */
  circle?: Circle;
  /** The parent's explicit "share them with that circle too": widen THEIR OWN keepsakes on the wish to it first. */
  widen?: boolean;
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
): Promise<{ ok: boolean; url?: string; reason?: 'name' | 'too-private' }> {
  const circle: Circle = input.circle && (CIRCLES as readonly string[]).includes(input.circle) ? input.circle : 'EXTENDED';
  const lines = (input.lines ?? []).filter((l) => l && typeof l.assetId === 'string' && typeof l.variantSku === 'string').slice(0, 50);
  const ids = [...new Set([...(input.assetIds ?? []), ...lines.map((l) => l.assetId)].filter(Boolean))];
  if (ids.length === 0) return { ok: false };

  // Screen the child's name BEFORE keeping anything — never store an unscreened
  // subject, and never silently strip a surname.
  const screened = screenChildFirstName(input.subject);
  if (!screened.ok) return { ok: false, reason: 'name' };
  const title = screened.value ? `${screened.value}’s wishlist` : null;

  const familyId = await ensureHomeFamily(db, account.id, account.name);

  // The child this wish is FOR — find-or-create from the screened first name, so the
  // kept creations file into their corner of the keepsake home (grows with the child).
  const child = screened.value ? await resolveChildSubject(db, familyId, account.id, screened.value) : null;

  // Keep each creation. Idempotent for an already-kept asset the owner holds; a
  // draft we can't claim (wrong claim / BLOCKED) throws and is left out of the link.
  const adopted: string[] = [];
  for (const assetId of ids) {
    try {
      await adoptEphemeralDraft(db, account.id, familyId, assetId, uploadClaims);
      adopted.push(assetId);
    } catch {
      // not ours to keep / blocked / already gone
    }
  }

  // File the kept creations under the child subject. The controller is the CHILD'S
  // controlling parent (not necessarily the uploader) — a child's asset is keyed to
  // its controller, never the uploader (children's-data rule).
  if (child && adopted.length > 0) {
    await db
      .update(assets)
      .set({ childSubjectId: child.id, controllerAccountId: child.controllerAccountId })
      .where(and(inArray(assets.id, adopted), eq(assets.familyId, familyId)));
  }

  const viewer = await resolveViewerContext(db, account.id, familyId);
  // their explicit "share them with that circle too": only keepsakes THEY may widen (the adder's choice — D27)
  if (input.widen) {
    const rows = await db.select().from(assets).where(and(inArray(assets.id, adopted), eq(assets.familyId, familyId)));
    for (const r of rows) {
      const ref = assetRefOf(r);
      if (!isNarrower(effectiveVisibility(ref), circle)) continue;
      if (planVisibilityChange(ref, viewer, circle).allowed) await changeAssetVisibility(db, r.id, viewer, circle);
    }
  }
  try {
    // the wish sells what's in the basket (06-B2): its lines as made; bare keepsakes only for an old caller
    const { token } = await createGiftLink(db, viewer, {
      familyId,
      assetIds: lines.length ? [] : ids,
      lines,
      title,
      recipient: { kind: 'open', circle },
    });
    return { ok: true, url: `/g/${token}` };
  } catch (e) {
    if (e instanceof NothingToShowError) return { ok: false, reason: 'too-private' };
    return { ok: false };
  }
}
