import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { AuthzError, canManageFamily } from '@/authz';
import { appArtistProgress, appTokens, assets, auditRecords, children } from '@/db/schema';
import { parseSyncPatch, widens, type SyncChoices, type SyncKeepsakes } from '@/lib/drawSync';
import { isFreshSignIn } from '@/lib/freshSignIn';
import { deleteAsset, KeepsakeInUseError, resolveViewerContext } from '@/server/assets';
import type { DbHandle } from '@/server/db';

/**
 * What syncs between Snickerdoodle Draw and the website — a grown-up's standing choice, made at
 * linking and changeable any time (project-office/briefs/DRAW-APP-sync-choices.md, the Contract).
 * Stored per app link (the phone's key). Privacy by default: nothing automatic, nothing ticked,
 * until a grown-up chooses. Stopping a sync never deletes what already synced.
 *
 * This file reads and writes the choices and the drawing-days backup; the pure checks (shared with
 * the connect page) are in src/lib/drawSync.ts.
 */
export * from '@/lib/drawSync';

// ── reading / changing the choices ────────────────────────────────────────────────────────────────

type TokenSyncRow = { syncKeepsakes: SyncKeepsakes; syncChildren: boolean; syncProgress: boolean; syncBirthdays: boolean };
export const syncOf = (row: TokenSyncRow): SyncChoices => ({ keepsakes: row.syncKeepsakes, children: row.syncChildren, progress: row.syncProgress, birthdays: row.syncBirthdays });
const SYNC_COLS = { syncKeepsakes: appTokens.syncKeepsakes, syncChildren: appTokens.syncChildren, syncProgress: appTokens.syncProgress, syncBirthdays: appTokens.syncBirthdays };

export async function getTokenSync(db: DbHandle, tokenId: string): Promise<SyncChoices> {
  const [row] = await db
    .select(SYNC_COLS)
    .from(appTokens)
    .where(eq(appTokens.id, tokenId));
  if (!row) throw new Error('no such link');
  return syncOf(row);
}

/** Who changed the choices: the connect page (at linking), the app's grown-ups' corner, or the account page. */
export type SyncChangedBy = 'connect' | 'app' | 'website';

/** The consent-change audit record for a link's choices (never anything about a child). */
export function syncAuditRow(input: { familyId: string; accountId: string; tokenId: string; by: SyncChangedBy; from: SyncChoices | null; to: SyncChoices }) {
  return {
    familyId: input.familyId,
    actorAccountId: input.accountId,
    actorType: 'MEMBER' as const,
    event: 'CONSENT_CHANGED' as const,
    targetType: 'app_sync',
    targetId: input.tokenId,
    metadata: { by: input.by, from: input.from, to: input.to },
  };
}

/**
 * Change some of a live link's choices. Only a change that actually changes something is written and
 * audited. Turning a choice off deletes nothing (deleting stays its own explicit action).
 */
export async function updateTokenSync(
  db: DbHandle,
  link: { tokenId: string; accountId: string; familyId: string },
  patch: Partial<SyncChoices>,
  by: SyncChangedBy,
  now = new Date(),
): Promise<SyncChoices> {
  const [row] = await db
    .select({ ...SYNC_COLS, chosenAt: appTokens.syncChosenAt })
    .from(appTokens)
    .where(and(eq(appTokens.id, link.tokenId), eq(appTokens.accountId, link.accountId), isNull(appTokens.revokedAt)));
  if (!row) throw new Error('no such link');
  const from = syncOf(row);
  const to: SyncChoices = { ...from, ...patch };
  const changed = to.keepsakes !== from.keepsakes || to.children !== from.children || to.progress !== from.progress || to.birthdays !== from.birthdays;
  // a phone linked before the choices existed: the first explicit save counts as choosing, even "no change"
  if (!changed && row.chosenAt) return from;
  await db
    .update(appTokens)
    .set({ syncKeepsakes: to.keepsakes, syncChildren: to.children, syncProgress: to.progress, syncBirthdays: to.birthdays, syncChosenAt: now })
    .where(eq(appTokens.id, link.tokenId));
  await db.insert(auditRecords).values(syncAuditRow({ ...link, by, from: row.chosenAt ? from : null, to }));
  return to;
}

export type WebsiteSyncResult = { ok: true; sync: SyncChoices } | { ok: false; reason: 'not-found' | 'invalid' | 'sign-in-again' };

/**
 * The account page's "what syncs" for one of THIS account's linked phones. The phone must be this
 * account's own, still linked, and the account must still run that family (the key would stop
 * working otherwise anyway). Widening needs a sign-in in the last 15 minutes (`signedInAt`, A-63); narrowing, stopping
 * and a phone's very first "nothing" never ask.
 */
export async function updateSyncFromWebsite(
  db: DbHandle,
  accountId: string,
  tokenId: string,
  raw: Record<string, unknown>,
  signedInAt: Date | null,
  now = new Date(),
): Promise<WebsiteSyncResult> {
  const parsed = parseSyncPatch(raw);
  if (!parsed.ok) return { ok: false, reason: 'invalid' };
  const [tok] = await db
    .select({ id: appTokens.id, familyId: appTokens.familyId })
    .from(appTokens)
    .where(and(eq(appTokens.id, tokenId), eq(appTokens.accountId, accountId), isNull(appTokens.revokedAt)));
  if (!tok) return { ok: false, reason: 'not-found' };
  const viewer = await resolveViewerContext(db, accountId, tok.familyId);
  if (!canManageFamily(viewer.membership)) return { ok: false, reason: 'not-found' };
  if (widens(await getTokenSync(db, tokenId), parsed.patch) && !isFreshSignIn(signedInAt, now)) return { ok: false, reason: 'sign-in-again' };
  const sync = await updateTokenSync(db, { tokenId, accountId, familyId: tok.familyId }, parsed.patch, 'website', now);
  return { ok: true, sync };
}

// ── the backups, from the website side ────────────────────────────────────────────────────────────

export interface ProgressBackupSummary {
  childId: string;
  firstName: string;
  updatedOn: string;
}

/** The drawing-days backups in the families this account RUNS (the account page lists them). */
export async function listProgressBackups(db: DbHandle, ownedFamilyIds: string[]): Promise<ProgressBackupSummary[]> {
  if (!ownedFamilyIds.length) return [];
  const rows = await db
    .select({ childId: appArtistProgress.childId, firstName: children.firstName, updatedAt: appArtistProgress.updatedAt })
    .from(appArtistProgress)
    .innerJoin(children, eq(children.id, appArtistProgress.childId))
    .where(inArray(appArtistProgress.familyId, ownedFamilyIds));
  return rows.map((r) => ({ childId: r.childId, firstName: r.firstName, updatedOn: r.updatedAt.toISOString().slice(0, 10) }));
}

/** "delete the backed-up drawing days": every backup in the families this account runs. Audited. */
export async function deleteProgressBackups(db: DbHandle, accountId: string, ownedFamilyIds: string[]): Promise<number> {
  let total = 0;
  for (const familyId of ownedFamilyIds) {
    const viewer = await resolveViewerContext(db, accountId, familyId);
    if (!canManageFamily(viewer.membership)) continue; // re-checked here, never trusted from the caller
    const gone = await db.delete(appArtistProgress).where(eq(appArtistProgress.familyId, familyId)).returning({ childId: appArtistProgress.childId });
    if (gone.length) {
      await db.insert(auditRecords).values({
        familyId,
        actorAccountId: accountId,
        actorType: 'MEMBER',
        event: 'APP_PROGRESS_DELETED',
        targetType: 'family',
        targetId: familyId,
        metadata: { children: gone.length, by: 'website' },
      });
    }
    total += gone.length;
  }
  return total;
}

/** A backup no phone has refreshed for a year is deleted (retention job). */
export const PROGRESS_RETENTION_MS = 365 * 86_400_000;

export async function purgeStaleProgressBackups(db: DbHandle, now = new Date()): Promise<number> {
  const gone = await db
    .delete(appArtistProgress)
    .where(lt(appArtistProgress.updatedAt, new Date(now.getTime() - PROGRESS_RETENTION_MS)))
    .returning({ childId: appArtistProgress.childId, familyId: appArtistProgress.familyId });
  if (gone.length) {
    const byFamily = new Map<string, number>();
    for (const g of gone) byFamily.set(g.familyId, (byFamily.get(g.familyId) ?? 0) + 1);
    await db.insert(auditRecords).values(
      [...byFamily].map(([familyId, n]) => ({
        familyId,
        actorAccountId: null,
        actorType: 'SYSTEM' as const,
        event: 'APP_PROGRESS_DELETED' as const,
        targetType: 'family',
        targetId: familyId,
        metadata: { children: n, by: 'retention' },
      })),
    );
  }
  return gone.length;
}

// ── "remove everything Snickerdoodle Draw sent" (A-48) ────────────────────────────────────────────

/** How many keepsakes the app sent into the families this grown-up runs (the account page shows it). */
export async function countDrawSent(db: DbHandle, ownedFamilyIds: string[]): Promise<number> {
  if (!ownedFamilyIds.length) return 0;
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(inArray(assets.familyId, ownedFamilyIds), inArray(assets.source, ['app-screen', 'app-paper'])));
  return rows.length;
}

/**
 * The partner of "stopping a sync deletes nothing": delete, for good, every keepsake Snickerdoodle Draw
 * sent into the families this grown-up runs — each through the website's own cascading delete
 * (bytes, rows, gift-link items, passes, the erasure ledger for backups; audited per keepsake). One
 * still needed by a paid order that isn't made yet is left until it's on its way (as everywhere).
 * Website uploads are never touched.
 */
export async function removeEverythingDrawSent(db: DbHandle, accountId: string, ownedFamilyIds: string[]): Promise<{ removed: number; kept: number }> {
  let removed = 0;
  let kept = 0;
  for (const familyId of ownedFamilyIds) {
    const viewer = await resolveViewerContext(db, accountId, familyId);
    if (!canManageFamily(viewer.membership)) continue; // re-checked here, never trusted from the caller
    const sent = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.familyId, familyId), inArray(assets.source, ['app-screen', 'app-paper'])));
    for (const a of sent) {
      try {
        await deleteAsset(db, a.id, viewer);
        removed++;
      } catch (e) {
        if (e instanceof KeepsakeInUseError || e instanceof AuthzError) kept++;
        else throw e;
      }
    }
  }
  return { removed, kept };
}
