import { createHash } from 'node:crypto';
import { and, eq, gt, inArray, lte, or } from 'drizzle-orm';
import { assets, pendingKeeps } from '@/db/schema';
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

// ── "+ keepsake" by a guest, finished after sign-in ─────────────────────────────────────────────

const PENDING_KEEP_HOURS = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailHash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

/**
 * A guest tapped "+ keepsake", then asked to sign in with this email: remember to keep the drawing
 * once that person is signed in. Only the uploader can ask (their claim must still match the
 * draft); only a hash of the email is stored; it expires after a day.
 *
 * The email alone is NEVER enough to finish it (07-B5 / 08-B1): anyone can type anyone's address,
 * and the genuine sign-in email would then file a stranger's picture into that family's private
 * keepsake box. {@link finishPendingKeeps} also needs the upload claim — the same browser that
 * uploaded the drawing and asked for the keep.
 */
export async function rememberKeepForEmail(
  db: DbHandle,
  input: { assetId: string; email: string; uploadClaims: string[]; now?: Date },
): Promise<boolean> {
  const email = input.email?.trim();
  if (!email || !email.includes('@')) return false;
  const [row] = await db.select({ claim: assets.ephemeralClaimId }).from(assets).where(eq(assets.id, input.assetId));
  if (!row?.claim || !input.uploadClaims.includes(row.claim)) return false; // not their draft (or already kept)
  const now = input.now ?? new Date();
  const hash = emailHash(email);
  await db.delete(pendingKeeps).where(and(eq(pendingKeeps.assetId, input.assetId), eq(pendingKeeps.emailHash, hash)));
  await db.insert(pendingKeeps).values({ assetId: input.assetId, claimId: row.claim, emailHash: hash, expiresAt: new Date(now.getTime() + PENDING_KEEP_HOURS * 3_600_000) });
  return true;
}

/**
 * Signed in: keep whatever this person asked to keep as a guest — only when BOTH match: the email
 * they signed in with, and the upload claim THIS browser holds (07-B5: never by email alone). A
 * request made in another browser stays until it expires, in case they come back there signed in.
 * Returns the kept ids.
 */
export async function finishPendingKeeps(
  db: DbHandle,
  account: { id: string; name: string | null; email: string },
  uploadClaims: string[],
  now = new Date(),
): Promise<string[]> {
  const claims = (uploadClaims ?? []).filter((c): c is string => typeof c === 'string' && UUID.test(c));
  if (claims.length === 0) return [];
  const hash = emailHash(account.email);
  const rows = await db
    .select()
    .from(pendingKeeps)
    .where(and(eq(pendingKeeps.emailHash, hash), inArray(pendingKeeps.claimId, claims), gt(pendingKeeps.expiresAt, now)));
  const kept: string[] = [];
  for (const r of rows) if (await keepUpload(db, account, claims, r.assetId)) kept.push(r.assetId);
  // the ones this browser could finish are consumed; expired ones are gone either way
  await db
    .delete(pendingKeeps)
    .where(or(and(eq(pendingKeeps.emailHash, hash), inArray(pendingKeeps.claimId, claims)), lte(pendingKeeps.expiresAt, now)));
  return kept;
}

/** Retention: drop keep requests nobody came back for. */
export async function purgeExpiredPendingKeeps(db: DbHandle, now = new Date()): Promise<number> {
  const gone = await db.delete(pendingKeeps).where(lte(pendingKeeps.expiresAt, now)).returning({ id: pendingKeeps.id });
  return gone.length;
}
