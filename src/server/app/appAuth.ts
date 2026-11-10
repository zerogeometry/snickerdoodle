import { eq } from 'drizzle-orm';
import { canManageFamily, type ViewerContext } from '@/authz';
import { appTokens } from '@/db/schema';
import { resolveViewerContext } from '@/server/assets';
import type { DbHandle } from '@/server/db';
import type { SyncChoices } from '@/lib/drawSync';
import { APP_TOKEN_IDLE_MS, APP_TOKEN_PREFIX, revokeAppTokens } from './link';
import { hashSecret } from './secrets';

/** Who is calling from a linked phone — resolved entirely on the server from the key. */
export interface AppViewer {
  tokenId: string;
  accountId: string;
  familyId: string;
  /** null = every child in the family; otherwise only these. */
  childIds: string[] | null;
  /** The normal authz context (the owner's ACTIVE membership in that family). */
  viewer: ViewerContext;
  /** What a grown-up chose to sync on this link (read fresh from the key on every call). */
  sync: SyncChoices;
}

/** The link has gone (or never was): the app forgets its key and keeps everything on the phone. */
export class AppAuthError extends Error {
  readonly status = 401;
  constructor(readonly reason: 'no-key' | 'link-gone') {
    super(reason);
    this.name = 'AppAuthError';
  }
}

/** Write `last_used_at` at most this often (no write on every single call). */
const TOUCH_EVERY_MS = 60 * 60_000;

/**
 * Resolve the app's `Authorization: Bearer <key>` to an AppViewer, or throw AppAuthError (401).
 * On EVERY call: the key must exist, not be revoked, not be idle past 90 days, and its account must
 * STILL hold an ACTIVE owner membership in the key's family — so a handover or removal bites on the
 * very next call, with no grace. A key that fails a check is revoked so it can never come back.
 * The app never sends a family id; the key decides.
 */
export async function requireAppViewer(db: DbHandle, authorization: string | null | undefined, now = new Date()): Promise<AppViewer> {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(authorization?.trim() ?? '');
  if (!m || !m[1]!.startsWith(APP_TOKEN_PREFIX)) throw new AppAuthError('no-key');
  const [row] = await db.select().from(appTokens).where(eq(appTokens.tokenHash, hashSecret(m[1]!)));
  if (!row || row.revokedAt) throw new AppAuthError('link-gone');

  if (row.lastUsedAt.getTime() + APP_TOKEN_IDLE_MS <= now.getTime()) {
    await revokeAppTokens(db, { tokenId: row.id }, 'idle', { accountId: null, actorType: 'SYSTEM' }, now);
    throw new AppAuthError('link-gone');
  }
  const viewer = await resolveViewerContext(db, row.accountId, row.familyId);
  if (!canManageFamily(viewer.membership)) {
    await revokeAppTokens(db, { tokenId: row.id }, 'no-longer-owner', { accountId: null, actorType: 'SYSTEM' }, now);
    throw new AppAuthError('link-gone');
  }
  if (now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(appTokens).set({ lastUsedAt: now }).where(eq(appTokens.id, row.id));
  }
  return {
    tokenId: row.id,
    accountId: row.accountId,
    familyId: row.familyId,
    childIds: row.childIds ?? null,
    viewer,
    sync: { keepsakes: row.syncKeepsakes, children: row.syncChildren, progress: row.syncProgress, birthdays: row.syncBirthdays },
  };
}

/** Is this child one the phone's key covers (and in its family — checked by the caller's query)? */
export function childInScope(av: AppViewer, childId: string): boolean {
  return av.childIds === null || av.childIds.includes(childId);
}
