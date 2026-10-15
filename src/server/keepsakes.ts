import { and, eq, inArray } from 'drizzle-orm';
import { assets } from '@/db/schema';
import { adoptEphemeralDraft } from '@/server/assets';
import { resolveChildSubject } from '@/server/children';
import { ensureHomeFamily } from '@/server/onboarding';
import type { DbHandle } from './db';

/**
 * KEEP each basket creation into the caller's family (adopt the ephemeral draft →
 * kept, FAMILY by default, off the retention clock) and FILE it under the named
 * child subject. This is the "keepsake-save folds into checkout" step: a personalised
 * order needs a real, controller-owned keepsake, and the home grows with the child.
 *
 * Lenient by design for the checkout path: drafts the caller can't claim are skipped,
 * and an unusable/absent subject name simply leaves the creation unfiled (the order
 * shouldn't fail over a name) — but a surname is NEVER stored (resolveChildSubject
 * screens it). The controller becomes the child's controlling parent.
 *
 * Pure server core (db + resolved account + held claims as args) so it's testable.
 */
export async function keepAndFileCreations(
  db: DbHandle,
  account: { id: string; name: string | null },
  uploadClaims: string[],
  assetIds: string[],
  subject?: string | null,
  /** keep:false = file for an order without keeping yet (the parent chooses after purchase). */
  opts: { keep: boolean } = { keep: true },
): Promise<{ familyId: string | null; childId: string | null }> {
  const ids = [...new Set((assetIds ?? []).filter((x): x is string => !!x))];
  if (ids.length === 0) return { familyId: null, childId: null };

  const familyId = await ensureHomeFamily(db, account.id, account.name);

  const adopted: string[] = [];
  for (const id of ids) {
    try {
      await adoptEphemeralDraft(db, account.id, familyId, id, uploadClaims, { keep: opts.keep });
      adopted.push(id);
    } catch {
      // not ours to keep / blocked / already gone
    }
  }

  const child = subject ? await resolveChildSubject(db, familyId, account.id, subject) : null;
  if (child && adopted.length > 0) {
    await db
      .update(assets)
      .set({ childSubjectId: child.id, controllerAccountId: child.controllerAccountId })
      .where(and(inArray(assets.id, adopted), eq(assets.familyId, familyId)));
  }
  return { familyId, childId: child?.id ?? null };
}

/**
 * "+ keepsake" on the range: keep ONE already-uploaded drawing in the caller's keepsake box — a
 * guest draft is adopted via its claim; one they uploaded signed-in is simply marked kept. Either
 * way it's kept, off the retention clock. Returns false when it isn't theirs to keep.
 */
export async function keepUpload(db: DbHandle, account: { id: string; name: string | null }, uploadClaims: string[], assetId: string): Promise<boolean> {
  await keepAndFileCreations(db, account, uploadClaims, [assetId]);
  const [row] = await db
    .update(assets)
    .set({ keptInHome: true, purgeAfter: null })
    .where(and(eq(assets.id, assetId), eq(assets.controllerAccountId, account.id)))
    .returning({ id: assets.id });
  return !!row;
}
